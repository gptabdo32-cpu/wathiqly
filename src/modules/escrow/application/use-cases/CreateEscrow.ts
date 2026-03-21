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
    // 1. Domain Logic: Create the entity
    const escrow = Escrow.create({
      buyerId: params.buyerId,
      sellerId: params.sellerId,
      amount: params.amount,
      description: params.description,
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

      // 4. Update Domain State (Pure Domain Logic)
      // Note: In a stricter Clean Architecture, we might reload from DB or use a domain service
      // but updating the entity state is acceptable if the entity supports it.
      escrow.updateLedgerAccounts(escrowLedgerAccountId);

      // 5. Persistence: Update the Escrow Contract with ledger accounts
      await this.escrowRepo.update(escrow, tx);

      // 6. ATOMIC OUTBOX: Save events inside the SAME transaction
      if (params.sellerWalletAddress) {
        await this.escrowRepo.saveOutboxEvent({
          eventId: `evt_bc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          aggregateType: "escrow",
          aggregateId: escrowId,
          eventType: "EscrowCreateRequested",
          version: 1,
          payload: {
            escrowId,
            sellerWalletAddress: params.sellerWalletAddress,
            amount: params.amount,
          },
          idempotencyKey: `escrow_bc_create_${escrowId}`,
          status: "pending",
        }, tx);
      }

      await this.escrowRepo.saveOutboxEvent({
        eventId: `evt_fnd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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
        idempotencyKey: `escrow_fnd_lock_${escrowId}`,
        status: "pending",
      }, tx);

      return escrowId;
    });
  }
}
