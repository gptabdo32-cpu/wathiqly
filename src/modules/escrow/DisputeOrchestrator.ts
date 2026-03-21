import { OpenDispute, ResolveDispute } from "./application/use-cases/DisputeUseCases";

export class DisputeOrchestrator {
  static async openDispute(escrowId: number, initiatorId: number, reason: string) {
    return new OpenDispute().execute(escrowId, initiatorId, reason);
  }

  static async resolveDispute(disputeId: number, adminId: number, resolution: "buyer_refund" | "seller_payout") {
    return new ResolveDispute().execute(disputeId, adminId, resolution);
  }
}
