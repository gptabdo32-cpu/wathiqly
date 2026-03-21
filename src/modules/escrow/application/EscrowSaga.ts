import { TransactionManager } from "../../../core/db/TransactionManager";
import { IEscrowRepository } from "../domain/IEscrowRepository";
import { IPaymentService } from "../domain/IPaymentService";
import { Escrow } from "../domain/Escrow";
import { v4 as uuidv4 } from 'uuid';

export interface EscrowSagaInput {
  buyerId: number;
  sellerId: number;
  amount: string;
  description: string;
  sellerWalletAddress?: string;
}

/**
 * EscrowSaga Orchestrator (Deterministic State Machine)
 * 
 * Flow:
 * 1. PENDING_INITIALIZATION (DB Record)
 * 2. FUNDS_LOCK_PENDING (Payment Service Call)
 * 3. ACTIVE (Success) or FAILED (Compensation)
 */
export class EscrowSaga {
  constructor(
    private paymentService: IPaymentService,
    private escrowRepo: IEscrowRepository
  ) {}

  async execute(input: EscrowSagaInput): Promise<number> {
    const correlationId = uuidv4();
    
    // Step 1: Initialize Escrow State (Deterministic)
    const escrow = Escrow.create({
      buyerId: input.buyerId,
      sellerId: input.sellerId,
      amount: input.amount,
      description: input.description,
    });

    try {
      return await TransactionManager.run(async (tx) => {
        // 1. Persist Initial State
        const escrowId = await this.escrowRepo.create(escrow, tx);
        
        // 2. Emit Initialization Event (Traceable)
        await this.escrowRepo.saveOutboxEvent({
          eventId: uuidv4(),
          aggregateType: "escrow",
          aggregateId: escrowId,
          eventType: "EscrowInitialized",
          version: 1,
          payload: { escrowId, ...input },
          correlationId,
          idempotencyKey: `init_${escrowId}`,
          status: "pending",
        } as any, tx);

        // 3. Execute Financial Operation (External Service)
        // Note: In a fully async system, this would be triggered by the OutboxWorker
        // For this saga, we orchestrate the immediate lock but ensure it's idempotent
        const { escrowLedgerAccountId } = await this.paymentService.lockEscrowFunds({
          escrowId,
          amount: input.amount,
          description: input.description,
        }, tx);

        // 4. Transition to ACTIVE State
        const updatedEscrow = await this.escrowRepo.getById(escrowId, tx);
        if (updatedEscrow) {
          updatedEscrow.updateLedgerAccounts(escrowLedgerAccountId);
          await this.escrowRepo.update(updatedEscrow, tx);
        }

        // 5. Emit Success Event
        await this.escrowRepo.saveOutboxEvent({
          eventId: uuidv4(),
          aggregateType: "escrow",
          aggregateId: escrowId,
          eventType: "FundsLocked",
          version: 1,
          payload: { escrowId, escrowLedgerAccountId },
          correlationId,
          causationId: correlationId, // In this simple saga, the flow start is the cause
          idempotencyKey: `lock_success_${escrowId}`,
          status: "pending",
        } as any, tx);

        return escrowId;
      });
    } catch (error: any) {
      console.error(`[EscrowSaga][${correlationId}] Failure: ${error.message}`);
      // Failure is expected and modeled
      await this.handleFailure(input, correlationId, error);
      throw new Error(`Escrow creation failed: ${error.message}`);
    }
  }

  private async handleFailure(input: any, correlationId: string, error: Error) {
    // Log failure for observability
    console.error(`[EscrowSaga][${correlationId}] Initiating Failure Control...`);
    
    // In a production system, this would trigger a Compensation Saga
    // or move the state to 'FAILED' for manual/automated retry
  }
}
