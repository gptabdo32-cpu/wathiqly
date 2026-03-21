import { CreateEscrow, CreateEscrowInput } from "./application/use-cases/CreateEscrow";
import { ReleaseEscrow } from "./application/use-cases/ReleaseEscrow";

export class PaymentOrchestrator {
  static async initiateEscrow(params: CreateEscrowInput) {
    return new CreateEscrow().execute(params);
  }

  static async completeEscrow(escrowId: number) {
    return new ReleaseEscrow().execute(escrowId);
  }
}
