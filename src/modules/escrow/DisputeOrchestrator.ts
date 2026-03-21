import { OpenDispute, ResolveDispute } from "./application/use-cases/DisputeUseCases";
import { LedgerService } from "../blockchain/LedgerService";
import { DrizzleEscrowRepository } from "./infrastructure/DrizzleEscrowRepository";

/**
 * DisputeOrchestrator Facade
 * Phase 3.1: Converted to a pure Facade.
 */
export class DisputeOrchestrator {
  private static getDependencies() {
    return {
      ledgerService: new LedgerService(),
      escrowRepo: new DrizzleEscrowRepository()
    };
  }

  static async openDispute(escrowId: number, initiatorId: number, reason: string) {
    const { escrowRepo } = this.getDependencies();
    // @ts-ignore - This will be fixed once we inject dependencies properly
    return new OpenDispute(escrowRepo).execute(escrowId, initiatorId, reason);
  }

  static async resolveDispute(disputeId: number, adminId: number, resolution: "buyer_refund" | "seller_payout") {
    const { ledgerService, escrowRepo } = this.getDependencies();
    // @ts-ignore - This will be fixed once we inject dependencies properly
    return new ResolveDispute(ledgerService, escrowRepo).execute(disputeId, adminId, resolution);
  }
}
