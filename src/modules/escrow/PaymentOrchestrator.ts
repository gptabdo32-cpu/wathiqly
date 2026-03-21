import { CreateEscrow, CreateEscrowInput } from "./application/use-cases/CreateEscrow";
import { ReleaseEscrow } from "./application/use-cases/ReleaseEscrow";
import { LedgerService } from "../blockchain/LedgerService";
import { DrizzleEscrowRepository } from "./infrastructure/DrizzleEscrowRepository";

/**
 * PaymentOrchestrator Facade
 * Phase 3.1: Converted to a pure Facade.
 * All logic and side effects must reside in the Application Layer.
 */
export class PaymentOrchestrator {
  private static getDependencies() {
    return {
      ledgerService: new LedgerService(),
      escrowRepo: new DrizzleEscrowRepository()
    };
  }

  static async initiateEscrow(params: CreateEscrowInput) {
    const { ledgerService, escrowRepo } = this.getDependencies();
    return new CreateEscrow(ledgerService, escrowRepo).execute(params);
  }

  static async completeEscrow(escrowId: number) {
    const { ledgerService, escrowRepo } = this.getDependencies();
    return new ReleaseEscrow(ledgerService, escrowRepo).execute(escrowId);
  }
}
