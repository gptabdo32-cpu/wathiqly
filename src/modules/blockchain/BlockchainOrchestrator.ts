import { getDb } from "../../server/db";
import { outboxEvents } from "../../drizzle/schema_outbox";
import { eq } from "drizzle-orm";
import { blockchainService } from "./blockchain";
import { eventBus } from "../../core/events/EventBus";
import { EventType } from "../../core/events/EventTypes";
import { escrowContracts } from "../../drizzle/schema_escrow_engine";
import { disputes } from "../../drizzle/schema_escrow_engine";

/**
 * BlockchainOrchestrator
 * Responsible for processing outbox events related to blockchain synchronization.
 * It performs the actual blockchain interaction and updates the escrow/dispute contracts.
 * It does NOT update the outbox event status; that is handled by the OutboxWorker.
 */
export class BlockchainOrchestrator {
  static async processOutboxEvent(event: typeof outboxEvents.$inferSelect): Promise<{ success: boolean; txHash?: string; error?: string }> {
    const db = await getDb();
    if (!db) return { success: false, error: "Database not available" };

    try {
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
          
          // Dispatch internal event for UI/Notifications
          await eventBus.publish(EventType.ESCROW_FUNDS_LOCKED, payload);
          
          return { success: true, txHash };
        }
        case "EscrowReleaseRequested": {
          const payload = event.payload as { escrowId: number; onChainId: number; milestoneId: number; };
          const txHash = await blockchainService.releaseMilestone(payload.onChainId, payload.milestoneId);
          await db.update(escrowContracts)
            .set({ lastTxHash: txHash })
            .where(eq(escrowContracts.id, payload.escrowId));
          console.log(`[BlockchainOrchestrator] On-chain Escrow #${payload.onChainId} released. Tx: ${txHash}`);
          
          // Dispatch internal event
          await eventBus.publish(EventType.ESCROW_FUNDS_RELEASED, payload);
          
          return { success: true, txHash };
        }
        case "DisputeResolutionRequested": {
          const payload = event.payload as { disputeId: number; onChainId: number; milestoneId: number; releaseToSeller: boolean; };
          const txHash = await blockchainService.resolveDispute(payload.onChainId, payload.milestoneId, payload.releaseToSeller);
          await db.update(disputes)
            .set({ blockchainTxHash: txHash })
            .where(eq(disputes.id, payload.disputeId));
          console.log(`[BlockchainOrchestrator] On-chain Dispute #${payload.onChainId} resolved. Tx: ${txHash}`);
          return { success: true, txHash };
        }
        default:
          return { success: false, error: `Unknown event type: ${event.eventType}` };
      }
    } catch (error: any) {
      console.error(`[BlockchainOrchestrator] Error processing event ${event.id}:`, error);
      return { success: false, error: error.message };
    }
  }
}
