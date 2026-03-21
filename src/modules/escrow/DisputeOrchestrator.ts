import { EscrowEngine } from "./EscrowEngine";
import { eventBus } from "../events/EventBus";
import { EventType } from "../events/EventTypes";

/**
 * DisputeOrchestrator
 * Handles the orchestration of dispute resolution, ensuring financial execution is linked.
 */
export class DisputeOrchestrator {
  static async resolveDispute(
    disputeId: number,
    adminId: number,
    resolution: "buyer_refund" | "seller_payout"
  ) {
    console.log(`[DisputeOrchestrator] Resolving Dispute #${disputeId} with ${resolution}`);

    // 1. Resolve via EscrowEngine, which now handles Ledger updates
    const success = await EscrowEngine.resolveDispute(disputeId, adminId, resolution);

    if (success) {
      // 2. Additional logic: Adjust Trust Scores, Notify Parties
      await eventBus.publish(EventType.ESCROW_DISPUTE_RESOLVED, { disputeId, resolution });
    }

    return success;
  }
}
