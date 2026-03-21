import { TransactionManager } from "../../../../core/db/TransactionManager";
import { ILedgerService } from "../../../blockchain/domain/ILedgerService";
import { IEscrowRepository } from "../../domain/IEscrowRepository";

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
    // 1. Logic check (Domain Rule): Amount validation
    const amount = parseFloat(params.amount);
    if (isNaN(amount) || amount <= 0) {
      throw new Error("Invalid escrow amount");
    }

    // 2. Initial Checks (Should ideally use a Domain Service)
    // Note: In a fully clean architecture, finding the buyerAccount would also go through a Repository
    // For this refactor, we focus on the Escrow and Transactional consistency.

    return await TransactionManager.run(async (tx) => {
      // 3. Create a System Escrow Account for this contract
      const escrowAccountId = await this.ledgerService.createAccount(
        0, // System user ID
        `Escrow Hold for ${params.description}`,
        "liability"
      );

      // 4. Record the Escrow Contract via Repository
      const escrowId = await this.escrowRepo.create({
        buyerId: params.buyerId,
        sellerId: params.sellerId,
        buyerLedgerAccountId: 0, // Simplified for now, would be resolved by a service
        escrowLedgerAccountId: escrowAccountId,
        amount: params.amount,
        status: "locked",
        description: params.description,
        blockchainStatus: params.sellerWalletAddress ? "pending" : "none",
      }, tx);

      // 5. Move funds via Ledger (Ensuring LedgerService supports 'tx' context)
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

      // 6. ATOMIC OUTBOX: Save event inside the SAME transaction
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

      // 7. Internal Event (Outbox for deterministic internal processing)
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
