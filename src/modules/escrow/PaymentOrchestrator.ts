import { CreateEscrow, CreateEscrowInput } from "./application/use-cases/CreateEscrow";
import { ReleaseEscrow } from "./application/use-cases/ReleaseEscrow";

/**
 * PaymentOrchestrator Facade
 * Phase 3.1: Converted to a pure Facade.
 * All logic and side effects must reside in the Application Layer.
 */
export class PaymentOrchestrator {
  static async initiateEscrow(params: CreateEscrowInput) {
    return new CreateEscrow().execute(params);
  }

  static async completeEscrow(escrowId: number) {
    return new ReleaseEscrow().execute(escrowId);
  }
}
