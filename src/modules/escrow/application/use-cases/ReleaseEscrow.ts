import { TransactionManager } from "../../../../core/db/TransactionManager";
import { ILedgerService } from "../../../blockchain/domain/ILedgerService";
import { IEscrowRepository } from "../../domain/IEscrowRepository";

export class ReleaseEscrow {
  constructor(
    private ledgerService: ILedgerService,
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

      const props = escrow.getProps();

      // 4. Ledger: Transfer funds
      await this.ledgerService.recordTransaction({
        description: `Releasing funds for Escrow #${escrowId}`,
        referenceType: "escrow",
        referenceId: escrowId,
        escrowContractId: escrowId,
        idempotencyKey: `escrow_release_${escrowId}`,
        entries: [
          { accountId: props.escrowLedgerAccountId, debit: "0.0000", credit: props.amount },
          { accountId: 2, debit: props.amount, credit: "0.0000" }, // Simplified seller account ID
        ],
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
