import { CreateEscrow, CreateEscrowInput } from "./application/use-cases/CreateEscrow";
import { LedgerService } from "../blockchain/LedgerService";
import { ReleaseEscrow } from "./application/use-cases/ReleaseEscrow";
import { OpenDispute, ResolveDispute } from "./application/use-cases/DisputeUseCases";
import { DrizzleEscrowRepository } from "./infrastructure/DrizzleEscrowRepository";
import { PaymentService } from "./infrastructure/PaymentService";

/**
 * EscrowEngine Facade
 * Phase 3.1: Converted to a pure Facade. 
 * All business logic, DB calls, and conditions must reside in use cases (Application Layer).
 */
export class EscrowEngine {
  private static getDependencies() {
    const ledgerService = new LedgerService();
    return {
      paymentService: new PaymentService(ledgerService),
      escrowRepo: new DrizzleEscrowRepository()
    };
  }

  static async lockFunds(params: CreateEscrowInput) {
    const { paymentService, escrowRepo } = this.getDependencies();
    return new CreateEscrow(paymentService, escrowRepo).execute(params);
  }

  static async releaseFunds(escrowId: number) {
    const { ledgerService, escrowRepo } = this.getDependencies();
    return new ReleaseEscrow(ledgerService, escrowRepo).execute(escrowId);
  }

  static async openDispute(escrowId: number, initiatorId: number, reason: string) {
    const { escrowRepo } = this.getDependencies();
    return new OpenDispute(escrowRepo).execute(escrowId, initiatorId, reason);
  }

  static async resolveDispute(disputeId: number, adminId: number, resolution: "buyer_refund" | "seller_payout") {
    const { ledgerService, escrowRepo } = this.getDependencies();
    return new ResolveDispute(ledgerService, escrowRepo).execute(disputeId, adminId, resolution);
  }
}
