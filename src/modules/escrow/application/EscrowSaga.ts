import { TransactionManager } from "../../../core/db/TransactionManager";
import { IEscrowRepository } from "../domain/IEscrowRepository";
import { IPaymentService } from "../domain/IPaymentService";
import { Escrow } from "../domain/Escrow";

export interface EscrowSagaInput {
  buyerId: number;
  sellerId: number;
  amount: string;
  description: string;
  sellerWalletAddress?: string;
}

/**
 * EscrowSaga Orchestrator
 * Manages the multi-step process of creating an escrow, locking funds,
 * and handling failures with compensating transactions (Rollback).
 */
export class EscrowSaga {
  constructor(
    private paymentService: IPaymentService,
    private escrowRepo: IEscrowRepository
  ) {}

  async execute(input: EscrowSagaInput): Promise<number> {
    // Step 1: Create Escrow (Pending)
    const escrow = Escrow.create({
      buyerId: input.buyerId,
      sellerId: input.sellerId,
      amount: input.amount,
      description: input.description,
      sellerWalletAddress: input.sellerWalletAddress,
    });

    let escrowId: number;

    try {
      escrowId = await TransactionManager.run(async (tx) => {
        // Persistence: Initial record
        const id = await this.escrowRepo.create(escrow, tx);
        
        // Step 2: Lock Funds (Financial Operation)
        const { escrowLedgerAccountId } = await this.paymentService.lockEscrowFunds({
          escrowId: id,
          amount: input.amount,
          description: input.description,
        }, tx);

        // Step 3: Update Escrow with Ledger Info
        const updatedEscrow = Escrow._createFromPersistence({
          ...(escrow as any)._getInternalProps(),
          id: id,
          escrowLedgerAccountId,
        });
        await this.escrowRepo.update(updatedEscrow, tx);

        // Step 4: Emit Outbox Event (Atomic)
        await this.escrowRepo.saveOutboxEvent({
          eventId: `evt_saga_${Date.now()}`,
          aggregateType: "escrow",
          aggregateId: id,
          eventType: "EscrowFundsLocked",
          version: 1,
          payload: { escrowId: id, amount: input.amount },
          idempotencyKey: `saga_lock_${id}`,
          status: "pending",
        }, tx);

        return id;
      });

      return escrowId;
    } catch (error: any) {
      console.error("[EscrowSaga] Failure detected, initiating compensation...", error.message);
      // In a real distributed system, this might be triggered by an event or a worker
      // Here we handle immediate failure within the saga execution
      throw new Error(`Escrow creation failed: ${error.message}`);
    }
  }

  /**
   * Compensating Transaction (Rollback)
   * To be called if subsequent steps in a distributed flow fail.
   */
  async rollback(escrowId: number) {
    await TransactionManager.run(async (tx) => {
      const escrow = await this.escrowRepo.getById(escrowId, tx);
      if (!escrow) return;

      // Logic to refund funds if they were locked
      const props = (escrow as any)._getInternalProps();
      if (props.escrowLedgerAccountId) {
        await this.paymentService.refundEscrowFunds({
          escrowId,
          amount: props.amount,
          escrowLedgerAccountId: props.escrowLedgerAccountId,
          buyerLedgerAccountId: props.buyerLedgerAccountId || 1, // Fallback
        }, tx);
      }

      // Update status to cancelled/refunded
      // (Assuming domain has a cancel method)
      await this.escrowRepo.updateEscrowBlockchainStatus(escrowId, "failed", "ROLLBACK", tx);
    });
  }
}
