import { getDb } from "../../server/db";
import { outboxEvents } from "../../drizzle/schema_outbox";
import { eq } from "drizzle-orm";
import { blockchainService } from "./blockchain";
import { escrowContracts } from "../../drizzle/schema_escrow_engine";
import { disputes } from "../../drizzle/schema_escrow_engine";

/**
 * BlockchainOrchestrator
 * Responsible for processing outbox events related to blockchain synchronization.
 */
export class BlockchainOrchestrator {
  static async processOutboxEvent(eventId: number) {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [event] = await db.select().from(outboxEvents).where(eq(outboxEvents.id, eventId));

    if (!event) {
      console.warn(`[BlockchainOrchestrator] Outbox event ${eventId} not found.`);
      return;
    }

    if (event.status !== "pending") {
      console.log(`[BlockchainOrchestrator] Outbox event ${eventId} already processed or in progress.`);
      return;
    }

    try {
      await db.update(outboxEvents).set({ status: "processing" }).where(eq(outboxEvents.id, eventId));

      switch (event.eventType) {
        case "EscrowCreateRequested": {
          const payload = event.payload as { escrowId: number; sellerWalletAddress: string; amount: string; };
          const amountInWei = blockchainService.toWei(payload.amount);
          const { txHash } = await blockchainService.createEscrow(
            payload.sellerWalletAddress,
            null, // mediator
            `escrow_${payload.escrowId}`,
            amountInWei
          );

          await db.update(escrowContracts)
            .set({ 
              blockchainStatus: "synced", 
              lastTxHash: txHash 
            })
            .where(eq(escrowContracts.id, payload.escrowId));
            
          console.log(`[BlockchainOrchestrator] Escrow #${payload.escrowId} synced to blockchain: ${txHash}`);
          break;
        }
        case "EscrowReleaseRequested": {
          const payload = event.payload as { escrowId: number; onChainId: number; milestoneId: number; };
          const txHash = await blockchainService.releaseMilestone(payload.onChainId, payload.milestoneId);
          await db.update(escrowContracts)
            .set({ lastTxHash: txHash })
            .where(eq(escrowContracts.id, payload.escrowId));
          console.log(`[BlockchainOrchestrator] On-chain Escrow #${payload.onChainId} released. Tx: ${txHash}`);
          break;
        }
        case "DisputeResolutionRequested": {
          const payload = event.payload as { disputeId: number; onChainId: number; milestoneId: number; releaseToSeller: boolean; };
          const txHash = await blockchainService.resolveDispute(payload.onChainId, payload.milestoneId, payload.releaseToSeller);
          await db.update(disputes)
            .set({ blockchainTxHash: txHash })
            .where(eq(disputes.id, payload.disputeId));
          console.log(`[BlockchainOrchestrator] On-chain Dispute #${payload.onChainId} resolved. Tx: ${txHash}`);
          break;
        }
        default:
          throw new Error(`Unknown event type: ${event.eventType}`);
      }

      await db.update(outboxEvents).set({ status: "completed", processedAt: new Date() }).where(eq(outboxEvents.id, eventId));
    } catch (error: any) {
      console.error(`[BlockchainOrchestrator] Failed to process outbox event ${eventId}:`, error);
      await db.update(outboxEvents).set({ status: "failed", error: error.message, processedAt: new Date() }).where(eq(outboxEvents.id, eventId));
      throw error; // Re-throw to indicate failure
    }
  }
}
