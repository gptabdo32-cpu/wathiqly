import { CreateEscrow, CreateEscrowInput } from "./application/use-cases/CreateEscrow";
import { ReleaseEscrow } from "./application/use-cases/ReleaseEscrow";
import { OpenDispute, ResolveDispute } from "./application/use-cases/DisputeUseCases";

export class EscrowEngine {
  static async lockFunds(params: CreateEscrowInput) {
    return new CreateEscrow().execute(params);
  }

  static async releaseFunds(escrowId: number) {
    return new ReleaseEscrow().execute(escrowId);
  }

  static async openDispute(escrowId: number, initiatorId: number, reason: string) {
    return new OpenDispute().execute(escrowId, initiatorId, reason);
  }

  static async resolveDispute(disputeId: number, adminId: number, resolution: "buyer_refund" | "seller_payout") {
    return new ResolveDispute().execute(disputeId, adminId, resolution);
  }
}
