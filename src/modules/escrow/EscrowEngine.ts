import { CreateEscrow, CreateEscrowInput } from "./application/use-cases/CreateEscrow";
import { LedgerService } from "../blockchain/LedgerService";
import { ReleaseEscrow } from "./application/use-cases/ReleaseEscrow";
import { OpenDispute, ResolveDispute } from "./application/use-cases/DisputeUseCases";

/**
 * EscrowEngine Facade
 * Phase 3.1: Converted to a pure Facade. 
 * All business logic, DB calls, and conditions must reside in use cases (Application Layer).
 */
export class EscrowEngine {
  static async lockFunds(params: CreateEscrowInput) {
    const ledgerService = new LedgerService();
    return new CreateEscrow(ledgerService).execute(params);
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
