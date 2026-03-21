import { OpenDispute, ResolveDispute } from "./application/use-cases/DisputeUseCases";
import { LedgerService } from "../blockchain/LedgerService";
import { DrizzleEscrowRepository } from "./infrastructure/DrizzleEscrowRepository";
import { PaymentService } from "./infrastructure/PaymentService";

/**
 * DisputeOrchestrator Facade
 * Phase 3.1: Converted to a pure Facade.
 */
export class DisputeOrchestrator {
  private static getDependencies() {
    const ledgerService = new LedgerService();
    return {
      paymentService: new PaymentService(ledgerService),
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
