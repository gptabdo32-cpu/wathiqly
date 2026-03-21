import { OpenDispute, ResolveDispute } from "./application/use-cases/DisputeUseCases";
import { DrizzleEscrowRepository } from "./infrastructure/DrizzleEscrowRepository";
import { LedgerService } from "../blockchain/LedgerService";
import { LedgerPaymentService } from "./infrastructure/LedgerPaymentService";

/**
 * DisputeOrchestrator Facade
 * Phase 3.1: Converted to a pure Facade.
 * All logic and side effects must reside in the Application Layer.
 */
export class DisputeOrchestrator {
  private static getDependencies() {
    const ledgerService = new LedgerService();
    return {
      paymentService: new LedgerPaymentService(ledgerService),
      escrowRepo: new DrizzleEscrowRepository()
    };
  }

  static async openDispute(escrowId: number, initiatorId: number, reason: string) {
    const { escrowRepo } = this.getDependencies();
    return new OpenDispute(escrowRepo).execute(escrowId, initiatorId, reason);
  }

  static async resolveDispute(disputeId: number, adminId: number, resolution: "buyer_refund" | "seller_payout") {
    const { paymentService, escrowRepo } = this.getDependencies();
    return new ResolveDispute(paymentService, escrowRepo).execute(disputeId, adminId, resolution);
  }
}
