import { IEscrowRepository } from "../domain/IEscrowRepository";
import { Escrow } from "../domain/Escrow";
import { v4 as uuidv4 } from 'uuid';
import { SagaManager } from "../../../core/events/SagaManager";
import { Logger } from "../../../core/observability/Logger";

export interface EscrowSagaInput {
  buyerId: number;
  sellerId: number;
  amount: string;
  description: string;
  sellerWalletAddress?: string;
}

/**
 * EscrowSaga Orchestrator (Deterministic State Machine)
 * MISSION: Transform into true distributed, event-driven financial engine
 * RULE 8: Store saga state in database
 * RULE 9: Convert workflows into saga state machines
 * RULE 13: Remove all "any" types
 */
export class EscrowSaga {
  constructor(
    private escrowRepo: IEscrowRepository
  ) {}

  /**
   * Start the Saga.
   */
  async start(input: EscrowSagaInput): Promise<string> {
    const correlationId = uuidv4();
    
    const escrow = Escrow.create({
      buyerId: input.buyerId,
      sellerId: input.sellerId,
      amount: input.amount,
      description: input.description,
    });

    const escrowId = await this.escrowRepo.create(escrow);
    const sagaId = `escrow_saga_${escrowId}`;

    // Rule 8: Save saga state
    await SagaManager.saveState({
      sagaId,
      type: "EscrowSaga",
      status: "STARTED",
      state: { ...input, escrowId, step: "ESCROW_CREATED" },
      correlationId,
    });

    // Rule 3: Replace direct service calls with event publishing (via Outbox)
    await this.escrowRepo.saveOutboxEvent({
      eventId: uuidv4(),
      aggregateType: "escrow",
      aggregateId: escrowId,
      eventType: "EscrowCreated",
      version: 1,
      payload: { 
        escrowId, 
        buyerId: input.buyerId, 
        amount: input.amount,
        correlationId 
      },
      correlationId,
      idempotencyKey: `escrow_created_${escrowId}`,
      status: "pending",
    });

    return correlationId;
  }

  /**
   * Handle Payment Success (Task 8 - Idempotent & Deterministic)
   */
  async handlePaymentCompleted(correlationId: string, escrowLedgerAccountId: number, escrowId: number): Promise<void> {
    const sagaId = `escrow_saga_${escrowId}`;
    const state = await SagaManager.getState<Record<string, unknown>>(sagaId);
    
    if (!state || state.status === "COMPLETED") return;
    
    Logger.info(`[EscrowSaga][CID:${correlationId}] Handling payment completion for Escrow #${escrowId}`);

    const escrow = await this.escrowRepo.getById(escrowId);
    if (!escrow) throw new Error(`Escrow #${escrowId} not found`);

    if (escrow.canBeLocked()) {
        escrow.lock();
        // Rule 1: No direct cross-module calls (Ledger update should be event-driven)
        await this.escrowRepo.update(escrow);
    }

    // Rule 8: Update saga state
    await SagaManager.saveState({
      sagaId,
      type: "EscrowSaga",
      status: "COMPLETED",
      state: { ...state, status: "LOCKED", step: "COMPLETED", escrowLedgerAccountId },
      correlationId,
    });

    await this.escrowRepo.saveOutboxEvent({
      eventId: uuidv4(),
      aggregateType: "escrow",
      aggregateId: escrowId,
      eventType: "EscrowSagaCompleted",
      version: 1,
      payload: { 
        escrowId, 
        status: "LOCKED",
        timestamp: new Date().toISOString()
      },
      correlationId,
      idempotencyKey: `saga_completed_${correlationId}`,
      status: "pending",
    });
  }

  /**
   * Handle Payment Failure
   */
  async handlePaymentFailed(correlationId: string, reason: string, escrowId: number): Promise<void> {
    const sagaId = `escrow_saga_${escrowId}`;
    const state = await SagaManager.getState<Record<string, unknown>>(sagaId);
    if (!state) return;

    await SagaManager.saveState({
      sagaId,
      type: "EscrowSaga",
      status: "FAILED",
      state: { ...state, reason, step: "FAILED" },
      correlationId,
    });
    
    Logger.error(`[EscrowSaga][CID:${correlationId}] Payment failed for Escrow #${escrowId}: ${reason}`);
  }
}
