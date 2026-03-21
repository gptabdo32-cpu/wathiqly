import { TransactionManager } from "../../../../core/db/TransactionManager";
import { IEscrowRepository } from "../../domain/IEscrowRepository";
import { Escrow } from "../../domain/Escrow";
import { IPaymentService } from "../../domain/IPaymentService";

export interface CreateEscrowInput {
  buyerId: number;
  sellerId: number;
  amount: string;
  description: string;
  sellerWalletAddress?: string;
}

export class CreateEscrow {
  constructor(
    private paymentService: IPaymentService,
    private escrowRepo: IEscrowRepository
  ) {}

  async execute(params: CreateEscrowInput) {
    // 1. Domain Logic: Create the entity (Validation happens inside the Domain)
    const escrow = Escrow.create({
      buyerId: params.buyerId,
      sellerId: params.sellerId,
      amount: params.amount,
      description: params.description,
      sellerWalletAddress: params.sellerWalletAddress,
    });

    return await TransactionManager.run(async (tx) => {
      // 2. Persistence: Initial record to get an ID
      const escrowId = await this.escrowRepo.create(escrow, tx);

      // 3. Infrastructure Logic: Lock funds via PaymentService
      const { escrowLedgerAccountId } = await this.paymentService.lockEscrowFunds({
        escrowId,
        amount: params.amount,
        description: params.description,
      }, tx);

      // 4. Update Domain Props with Infrastructure details
      const props = escrow.getProps();
      const updatedEscrow = Escrow.fromPersistence({
        ...props,
        id: escrowId,
        buyerLedgerAccountId: 0, // Simplified for now
        escrowLedgerAccountId: escrowLedgerAccountId,
      });

      // 5. Persistence: Update the Escrow Contract with ledger accounts
      await this.escrowRepo.update(updatedEscrow, tx);

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
