import { ILedgerService } from "../../modules/blockchain/domain/ILedgerService";
import { LedgerService } from "../../modules/blockchain/LedgerService";
import { IPaymentService } from "../../modules/escrow/domain/IPaymentService";
import { PaymentService } from "../../modules/escrow/infrastructure/PaymentService";
import { IEscrowRepository } from "../../modules/escrow/domain/IEscrowRepository";
import { DrizzleEscrowRepository } from "../../modules/escrow/infrastructure/DrizzleEscrowRepository";
import { CreateEscrow } from "../../modules/escrow/application/use-cases/CreateEscrow";
import { ReleaseEscrow } from "../../modules/escrow/application/use-cases/ReleaseEscrow";
import { OpenDispute, ResolveDispute } from "../../modules/escrow/application/use-cases/DisputeUseCases";
import { EscrowSaga } from "../../modules/escrow/application/EscrowSaga";

export class Container {
  private static _ledgerService: ILedgerService = new LedgerService();
  private static _paymentService: IPaymentService = new PaymentService(this._ledgerService);
  private static _escrowRepo: IEscrowRepository = new DrizzleEscrowRepository();
  private static _escrowSaga: EscrowSaga = new EscrowSaga(this._escrowRepo);

  static getCreateEscrow() {
    return new CreateEscrow(this._escrowRepo);
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

  static getEscrowRepository(): IEscrowRepository {
    return this._escrowRepo;
  }

  static getPaymentService(): IPaymentService {
    return this._paymentService;
  }

  static getLedgerService(): ILedgerService {
    return this._ledgerService;
  }

  static get(type: any) {
    if (type === EscrowSaga) return this._escrowSaga;
    throw new Error(`Type ${type.name} not registered in Container`);
  }
}
