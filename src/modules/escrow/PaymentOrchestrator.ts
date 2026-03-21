import { CreateEscrow, CreateEscrowInput } from "./application/use-cases/CreateEscrow";
import { ReleaseEscrow } from "./application/use-cases/ReleaseEscrow";
import { LedgerService } from "../blockchain/LedgerService";
import { LedgerPaymentService } from "./infrastructure/LedgerPaymentService";
import { DrizzleEscrowRepository } from "./infrastructure/DrizzleEscrowRepository";

/**
 * PaymentOrchestrator Facade
 * Phase 3.1: Converted to a pure Facade.
 * All logic and side effects must reside in the Application Layer.
 */
export class PaymentOrchestrator {
  private static getDependencies() {
    const ledgerService = new LedgerService();
    return {
      paymentService: new LedgerPaymentService(ledgerService),
      escrowRepo: new DrizzleEscrowRepository()
    };
  }

  static async initiateEscrow(params: CreateEscrowInput) {
    const { paymentService, escrowRepo } = this.getDependencies();
    return new CreateEscrow(paymentService, escrowRepo).execute(params);
  }

  static async completeEscrow(escrowId: number) {
    const { paymentService, escrowRepo } = this.getDependencies();
    return new ReleaseEscrow(paymentService, escrowRepo).execute(escrowId);
  }
}
