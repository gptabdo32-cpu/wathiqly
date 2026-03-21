import { LedgerService } from "../../modules/blockchain/LedgerService";
import { PaymentService } from "../../modules/escrow/infrastructure/PaymentService";
import { DrizzleEscrowRepository } from "../../modules/escrow/infrastructure/DrizzleEscrowRepository";
import { CreateEscrow } from "../../modules/escrow/application/use-cases/CreateEscrow";
import { ReleaseEscrow } from "../../modules/escrow/application/use-cases/ReleaseEscrow";
import { OpenDispute, ResolveDispute } from "../../modules/escrow/application/use-cases/DisputeUseCases";

export class Container {
  private static _ledgerService = new LedgerService();
  private static _paymentService = new PaymentService(this._ledgerService);
  private static _escrowRepo = new DrizzleEscrowRepository();

  static getCreateEscrow() {
    return new CreateEscrow(this._paymentService, this._escrowRepo);
  }

  static getReleaseEscrow() {
    return new ReleaseEscrow(this._paymentService, this._escrowRepo);
  }

  static getOpenDispute() {
    return new OpenDispute(this._escrowRepo);
  }

  static getResolveDispute() {
    return new ResolveDispute(this._paymentService, this._escrowRepo);
  }

  static getEscrowRepository() {
    return this._escrowRepo;
  }

  static getPaymentService() {
    return this._paymentService;
  }
}
