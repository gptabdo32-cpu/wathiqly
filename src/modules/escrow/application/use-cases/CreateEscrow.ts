import { TransactionManager } from "../../../../core/db/TransactionManager";
import { ILedgerService } from "../../../blockchain/domain/ILedgerService";
import { IEscrowRepository } from "../../domain/IEscrowRepository";
import { Escrow } from "../../domain/Escrow";

export interface CreateEscrowInput {
  buyerId: number;
  sellerId: number;
  amount: string;
  description: string;
  sellerWalletAddress?: string;
}

export class CreateEscrow {
  constructor(
    private ledgerService: ILedgerService,
    private escrowRepo: IEscrowRepository
  ) {}

  async execute(params: CreateEscrowInput) {
    // 1. Domain Logic: Create the entity (Validation happens inside the Domain)
    const escrow = Escrow.create({
      buyerId: params.buyerId,
      sellerId: params.sellerId,
      amount: params.amount,
      description: params.description,
      blockchainStatus: params.sellerWalletAddress ? "pending" : "none",
    });

    return await TransactionManager.run(async (tx) => {
      // 2. Infrastructure Logic: Create a System Escrow Account
      const escrowAccountId = await this.ledgerService.createAccount(
        0, // System user ID
        `Escrow Hold for ${params.description}`,
        "liability",
        tx
      );

      // 3. Update Domain Props with Infrastructure details
      const props = escrow.getProps();
      const updatedEscrow = Escrow.fromPersistence({
        ...props,
        buyerLedgerAccountId: 0, // Simplified for now
        escrowLedgerAccountId: escrowAccountId,
      });

      // 4. Persistence: Record the Escrow Contract
      const escrowId = await this.escrowRepo.create(updatedEscrow, tx);

      // 5. Ledger: Move funds
      await this.ledgerService.recordTransaction({
        description: `Locking funds for Escrow #${escrowId}`,
        referenceType: "escrow",
        referenceId: escrowId,
        escrowContractId: escrowId,
        idempotencyKey: `escrow_lock_${escrowId}`,
        entries: [
          { accountId: 1, debit: "0.0000", credit: params.amount }, // Simplified account lookup
          { accountId: escrowAccountId, debit: params.amount, credit: "0.0000" },
        ],
      }, tx);

      // 6. ATOMIC OUTBOX: Save events inside the SAME transaction
      if (params.sellerWalletAddress) {
        await this.escrowRepo.saveOutboxEvent({
          aggregateType: "escrow",
          aggregateId: escrowId,
          eventType: "EscrowCreateRequested",
          payload: {
            escrowId,
            sellerWalletAddress: params.sellerWalletAddress,
            amount: params.amount,
          },
          status: "pending",
        }, tx);
      }

      await this.escrowRepo.saveOutboxEvent({
        aggregateType: "escrow",
        aggregateId: escrowId,
        eventType: "EscrowFundsLocked",
        payload: {
          escrowId,
          buyerId: params.buyerId,
          sellerId: params.sellerId,
          amount: params.amount,
        },
        status: "pending",
      }, tx);

      return escrowId;
    });
  }
}
