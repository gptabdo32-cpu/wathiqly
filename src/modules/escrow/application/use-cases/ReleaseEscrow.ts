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
      // 1. Get contract via Repository with transaction context
      const contract = await this.escrowRepo.getById(escrowId, tx);
      if (!contract) throw new Error("Contract not found");
      
      // 2. Domain Rule: Check transition (Should be in Domain Entity eventually)
      if (contract.status !== "locked") {
        throw new Error(`Invalid Escrow transition: ${contract.status} -> released`);
      }

      // 3. Update status to released via Repository
      await this.escrowRepo.updateStatus(escrowId, "released", tx);

      // 4. Transfer funds from Escrow Hold to Seller Wallet via Ledger
      // Note: Seller account lookup should be abstracted
      await this.ledgerService.recordTransaction({
        description: `Releasing funds for Escrow #${escrowId}`,
        referenceType: "escrow",
        referenceId: escrowId,
        escrowContractId: escrowId,
        idempotencyKey: `escrow_release_${escrowId}`,
        entries: [
          { accountId: contract.escrowLedgerAccountId, debit: "0.0000", credit: contract.amount },
          { accountId: 2, debit: contract.amount, credit: "0.0000" }, // Simplified seller account ID
        ],
      }, tx);

      // 5. ATOMIC OUTBOX: Blockchain Sync
      if (contract.blockchainStatus === "synced" && contract.onChainId !== null) {
        await this.escrowRepo.saveOutboxEvent({
          aggregateType: "escrow",
          aggregateId: escrowId,
          eventType: "EscrowReleaseRequested",
          payload: {
            escrowId,
            onChainId: contract.onChainId,
            milestoneId: 0,
          },
          status: "pending",
        }, tx);
      }

      // 6. ATOMIC OUTBOX: Internal Notification
      await this.escrowRepo.saveOutboxEvent({
        aggregateType: "escrow",
        aggregateId: escrowId,
        eventType: "EscrowFundsReleased",
        payload: {
          escrowId,
          sellerId: contract.sellerId,
          amount: contract.amount,
        },
        status: "pending",
      }, tx);

      return true;
    });
  }
}
