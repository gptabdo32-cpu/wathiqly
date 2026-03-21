import { PaymentOrchestrator } from "./PaymentOrchestrator";
import { DisputeOrchestrator } from "./DisputeOrchestrator";
import { BlockchainOrchestrator } from "../ledger/BlockchainOrchestrator";
import { eventBus } from "../events/EventBus";
import { EventType } from "../events/EventTypes";

/**
 * Orchestration Layer
 * Centralizes complex business processes that span multiple services (Escrow, Ledger, Blockchain).
 * Acts as a facade, delegating to more specific orchestrators.
 */
export class OrchestrationLayer {
  static async initiateEscrow(params: {
    buyerId: number;
    sellerId: number;
    amount: string;
    description: string;
    sellerWalletAddress?: string;
  }) {
    console.log(`[OrchestrationLayer] Initiating Escrow for Buyer ${params.buyerId} to Seller ${params.sellerId}`);
    return PaymentOrchestrator.initiateEscrow(params);
  }

  static async completeEscrow(escrowId: number) {
    console.log(`[OrchestrationLayer] Completing Escrow #${escrowId}`);
    const success = await PaymentOrchestrator.completeEscrow(escrowId);
    if (success) {
      await eventBus.publish(EventType.ESCROW_FUNDS_RELEASED, { escrowId });
    }
    return success;
  }

  static async handleDisputeResolution(
    disputeId: number,
    adminId: number,
    resolution: "buyer_refund" | "seller_payout"
  ) {
    console.log(`[OrchestrationLayer] Resolving Dispute #${disputeId} with ${resolution}`);
    const success = await DisputeOrchestrator.resolveDispute(disputeId, adminId, resolution);
    if (success) {
      await eventBus.publish(EventType.ESCROW_DISPUTE_RESOLVED, { disputeId, resolution });
    }
    return success;
  }

  // A method to trigger processing of outbox events, typically called by a background worker
  static async processBlockchainOutboxEvent(eventId: number) {
    console.log(`[OrchestrationLayer] Processing blockchain outbox event #${eventId}`);
    return BlockchainOrchestrator.processOutboxEvent(eventId);
  }
}
