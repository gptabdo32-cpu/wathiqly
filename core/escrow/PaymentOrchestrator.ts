import { EscrowEngine } from "./EscrowEngine";
import { eventBus } from "../events/EventBus";
import { EventType } from "../events/EventTypes";

/**
 * PaymentOrchestrator
 * Centralizes the orchestration of payment-related flows, such as initiating and completing escrows.
 */
export class PaymentOrchestrator {
  static async initiateEscrow(params: {
    buyerId: number;
    sellerId: number;
    amount: string;
    description: string;
    sellerWalletAddress?: string;
  }) {
    console.log(`[PaymentOrchestrator] Initiating Escrow for Buyer ${params.buyerId} to Seller ${params.sellerId}`);
    
    // 1. Lock funds via EscrowEngine (handles Ledger & DB)
    const escrowId = await EscrowEngine.lockFunds(params);
    
    // 2. Additional business logic could go here (e.g., notifying parties, starting external checks)
    
    return escrowId;
  }

  static async completeEscrow(escrowId: number) {
    console.log(`[PaymentOrchestrator] Completing Escrow #${escrowId}`);
    
    // 1. Release funds via EscrowEngine
    const success = await EscrowEngine.releaseFunds(escrowId);
    
    if (success) {
      // 2. Business-level side effects
      await eventBus.publish(EventType.ESCROW_FUNDS_RELEASED, { escrowId });
    }
    
    return success;
  }
}
