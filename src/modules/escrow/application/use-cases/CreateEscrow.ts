import { TransactionManager } from "../../../../core/db/TransactionManager";
import { IEscrowRepository } from "../../domain/IEscrowRepository";
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
    // 1. Logic check (Domain Rule): Amount validation
    EscrowDomainService.validateEscrowAmount(params.amount);

    return await TransactionManager.run(async (tx) => {
      // 2. Create a System Escrow Account for this contract
      const escrowAccountId = await this.paymentService.createEscrowAccount(params.description, tx);

      // 3. Record the Escrow Contract via Repository
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

      // 4. Move funds via PaymentService
      await this.paymentService.lockEscrowFunds(escrowId, params.amount, escrowAccountId, tx);

      // 5. ATOMIC OUTBOX: Save event inside the SAME transaction
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

      // 6. Internal Event (Outbox for deterministic internal processing)
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
