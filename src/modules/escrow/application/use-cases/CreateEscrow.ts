import { TransactionManager } from "../../../../core/db/TransactionManager";
import { IEscrowRepository } from "../../domain/IEscrowRepository";
import { Escrow } from "../../domain/Escrow";
import { IPaymentService } from "../../domain/IPaymentService";
import { crypto } from "../../../../core/utils/utils"; // Assuming crypto helper exists

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
    const escrow = Escrow.create({
      buyerId: params.buyerId,
      sellerId: params.sellerId,
      amount: params.amount,
      description: params.description,
      sellerWalletAddress: params.sellerWalletAddress,
    });

    return await TransactionManager.run(async (tx) => {
      const escrowId = await this.escrowRepo.create(escrow, tx);

      const { escrowLedgerAccountId } = await this.paymentService.lockEscrowFunds({
        escrowId,
        amount: params.amount,
        description: params.description,
      }, tx);

      const props = (escrow as any)._getInternalProps();
      const updatedEscrow = Escrow._createFromPersistence({
        ...props,
        id: escrowId,
        buyerLedgerAccountId: 0, 
        escrowLedgerAccountId: escrowLedgerAccountId,
      });

      await this.escrowRepo.update(updatedEscrow, tx);

      // ATOMIC OUTBOX: Save events with eventId and idempotencyKey
      if (params.sellerWalletAddress) {
        await this.escrowRepo.saveOutboxEvent({
          eventId: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          aggregateType: "escrow",
          aggregateId: escrowId,
          eventType: "EscrowCreateRequested",
          version: 1,
          payload: {
            escrowId,
            sellerWalletAddress: params.sellerWalletAddress,
            amount: params.amount,
          },
          idempotencyKey: `escrow_create_req_${escrowId}`,
          status: "pending",
        }, tx);
      }

      await this.escrowRepo.saveOutboxEvent({
        eventId: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        aggregateType: "escrow",
        aggregateId: escrowId,
        eventType: "EscrowFundsLocked",
        version: 1,
        payload: {
          escrowId,
          buyerId: params.buyerId,
          sellerId: params.sellerId,
          amount: params.amount,
        },
        idempotencyKey: `escrow_funds_locked_${escrowId}`,
        status: "pending",
      }, tx);

      return escrowId;
    });
  }
}
