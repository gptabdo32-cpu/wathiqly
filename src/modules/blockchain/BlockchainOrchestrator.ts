import { IEscrowRepository } from "../escrow/domain/IEscrowRepository";
import { outboxEvents } from "../../drizzle/schema_outbox";
import { DrizzleEscrowRepository } from "../escrow/infrastructure/DrizzleEscrowRepository";
import { eq } from "drizzle-orm";
import { blockchainService } from "./blockchain";
// import { eventBus } from "../../core/events/EventBus";
// import { EventType } from "../../core/events/EventTypes";
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
    const escrowRepo: IEscrowRepository = new DrizzleEscrowRepository();

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

          await escrowRepo.updateEscrowBlockchainStatus(payload.escrowId, "synced", txHash);
            
          console.log(`[BlockchainOrchestrator] Escrow #${payload.escrowId} synced to blockchain: ${txHash}`);
          
          // Dispatch internal event for UI/Notifications - REMOVED: Events must originate from Outbox only
          // await eventBus.publish(EventType.ESCROW_FUNDS_LOCKED, payload);
          
          return { success: true, txHash };
        }
        case "EscrowReleaseRequested": {
          const payload = event.payload as { escrowId: number; onChainId: number; milestoneId: number; };
          const txHash = await blockchainService.releaseMilestone(payload.onChainId, payload.milestoneId);
          await escrowRepo.updateEscrowBlockchainStatus(payload.escrowId, "confirmed", txHash);
          console.log(`[BlockchainOrchestrator] On-chain Escrow #${payload.onChainId} released. Tx: ${txHash}`);
          
          // Dispatch internal event - REMOVED: Events must originate from Outbox only
          // await eventBus.publish(EventType.ESCROW_FUNDS_RELEASED, payload);
          
          return { success: true, txHash };
        }
        case "DisputeResolutionRequested": {
          const payload = event.payload as { disputeId: number; onChainId: number; milestoneId: number; releaseToSeller: boolean; };
          const txHash = await blockchainService.resolveDispute(payload.onChainId, payload.milestoneId, payload.releaseToSeller);
          await escrowRepo.updateDisputeBlockchainStatus(payload.disputeId, txHash);
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
