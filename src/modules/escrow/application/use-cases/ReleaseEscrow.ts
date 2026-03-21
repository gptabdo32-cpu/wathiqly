import { TransactionManager } from "../../../../core/db/TransactionManager";
import { IEscrowRepository } from "../../domain/IEscrowRepository";
import { IPaymentService } from "../../domain/IPaymentService";

export class ReleaseEscrow {
  constructor(
    private paymentService: IPaymentService,
    private escrowRepo: IEscrowRepository
  ) {}

  async execute(escrowId: number) {
    return await TransactionManager.run(async (tx) => {
      // 1. Persistence: Get contract via Repository
      const escrow = await this.escrowRepo.getById(escrowId, tx);
      if (!escrow) throw new Error("Escrow not found");
      
      // 2. Domain Rule: Perform transition inside the Entity
      escrow.release();

      // 3. Persistence: Update status
      await this.escrowRepo.update(escrow, tx);

      const props = (escrow as any)._getInternalProps();

      // 4. Infrastructure Logic: Release funds via PaymentService
      await this.paymentService.releaseEscrowFunds({
        escrowId,
        amount: props.amount,
        escrowLedgerAccountId: props.escrowLedgerAccountId!,
        sellerLedgerAccountId: 2, // Simplified seller account ID
      }, tx);

      // 5. ATOMIC OUTBOX: Internal Notification
      await this.escrowRepo.saveOutboxEvent({
        aggregateType: "escrow",
        aggregateId: escrowId,
        eventType: "EscrowFundsReleased",
        payload: {
          escrowId,
          sellerId: props.sellerId,
          amount: props.amount,
        },
        status: "pending",
      }, tx);

      return true;
    });
  }
}
