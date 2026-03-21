import { PaymentOrchestrator } from "./PaymentOrchestrator";
import { DisputeOrchestrator } from "./DisputeOrchestrator";
import { BlockchainOrchestrator } from "../blockchain/BlockchainOrchestrator";

/**
 * Orchestration Layer
 * Centralizes complex business processes that span multiple services (Escrow, Ledger, Blockchain).
 * Acts as a facade, delegating to more specific orchestrators.
 * 
 * ATOMICITY RULE: All events must originate from the Outbox. 
 * Direct eventBus publishing is forbidden here to ensure deterministic financial consistency.
 */
export class OrchestrationLayer {
  static async initiateEscrow(params: {
    buyerId: number;
    sellerId: number;
    amount: string;
    description: string;
    sellerWalletAddress?: string;
  }) {
    return PaymentOrchestrator.initiateEscrow(params);
  }

  static async completeEscrow(escrowId: number) {
    return PaymentOrchestrator.completeEscrow(escrowId);
  }

  static async handleDisputeResolution(
    disputeId: number,
    adminId: number,
    resolution: "buyer_refund" | "seller_payout"
  ) {
    return DisputeOrchestrator.resolveDispute(disputeId, adminId, resolution);
  }

  static async processBlockchainOutboxEvent(event: any) {
    return BlockchainOrchestrator.processOutboxEvent(event);
  }
}
