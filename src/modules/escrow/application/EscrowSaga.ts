import { EscrowSagaState, SagaStatus } from "../../../core/events/SagaTypes";
import { IEscrowRepository } from "../domain/IEscrowRepository";
import { Escrow } from "../domain/Escrow";
import { v4 as uuidv4 } from 'uuid';
import { SagaManager } from "../../../core/events/SagaManager";
import { AtomicSagaExecutor } from "../../../core/events/AtomicSagaExecutor";
import { Logger } from "../../../core/observability/Logger";
import { validateEvent, EventSchemas } from "../../../core/events/EventContract";
import { z } from "zod";
import { sagaTotalCounter, sagaActiveGauge } from "../../../core/observability/metricsServer";

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
 * RULE 1: Every Saga MUST be a full state machine
 * RULE 3: Typed Saga State (CRITICAL)
 * RULE 4: Full Compensation Lifecycle
 * RULE 10: Deterministic Time Handling
 */
export class EscrowSaga {
  private readonly SAGA_TYPE = "EscrowSaga";

  constructor(
    private escrowRepo: IEscrowRepository,
    private clock: { now: () => string } = { now: () => new Date().toISOString() }
  ) {}

  /**
   * Start the Saga.
   * Improvement 1, 8, 10: Atomic start with transaction and locking
   */
  async start(input: EscrowSagaInput): Promise<string> {
    const correlationId = uuidv4();
    
    // We need an ID first to lock on it, but for start we can use a temporary one or lock on buyerId
    // For simplicity and consistency, we'll create the escrow first then lock on the sagaId
    const escrow = Escrow.create({
      buyerId: input.buyerId,
      sellerId: input.sellerId,
      amount: input.amount,
      description: input.description,
    });

    const escrowId = await this.escrowRepo.create(escrow, correlationId);
    const sagaId = `escrow_saga_${escrowId}`;

    await AtomicSagaExecutor.execute({
      sagaId,
      correlationId,
      sagaType: this.SAGA_TYPE,
      operation: async (tx) => {
        const initialState: EscrowSagaState = {
          ...input,
          escrowId,
          currentStep: "INITIALIZING",
          history: [{ step: "INITIALIZING", timestamp: this.clock.now() }]
        };

        await SagaManager.saveState({
          sagaId,
          type: this.SAGA_TYPE,
          status: "STARTED",
          state: initialState,
          correlationId,
          tx
        });

        sagaTotalCounter.inc({ type: this.SAGA_TYPE, status: "STARTED" });
        sagaActiveGauge.inc({ type: this.SAGA_TYPE });

        await this.publishEvent("escrow.created", escrowId, {
          escrowId,
          buyerId: input.buyerId,
          sellerId: input.sellerId,
          amount: input.amount,
          currency: "SAR"
        }, correlationId, `escrow_created_${escrowId}`, tx);
      }
    });

    return correlationId;
  }

  /**
   * Handle Payment Authorized
   * Improvement 1, 2, 8, 10, 17: Atomic transition with OCC and locking
   */
  async handlePaymentAuthorized(correlationId: string, escrowId: number, paymentId: string): Promise<void> {
    const sagaId = `escrow_saga_${escrowId}`;
    
    await AtomicSagaExecutor.execute({
      sagaId,
      correlationId,
      sagaType: this.SAGA_TYPE,
      operation: async (tx) => {
        const state = await this.ensureSagaState(sagaId, correlationId);
        
        if (state.currentStep === "AUTHORIZED" || state.currentStep === "COMPLETED") return;

        this.validateTransition(state.currentStep, "AUTHORIZED");

        const escrow = await this.escrowRepo.getById(escrowId);
        if (!escrow) throw new Error(`Escrow #${escrowId} not found`);

        if (escrow.canBeLocked()) {
            escrow.lock();
            await this.escrowRepo.update(escrow, tx);
        }

        const newState: EscrowSagaState = {
          ...state,
          currentStep: "AUTHORIZED",
          paymentId,
          history: [...state.history, { step: "AUTHORIZED", timestamp: this.clock.now() }]
        };

        await SagaManager.saveState({
          sagaId,
          type: this.SAGA_TYPE,
          status: "AUTHORIZED",
          state: newState,
          correlationId,
          tx
        });

        await this.publishEvent("payment.capture.requested", escrowId, {
          paymentId,
          escrowId
        }, correlationId, `payment_capture_req_${correlationId}`, tx);
      }
    });
  }

  /**
   * Handle Payment Captured
   * Improvement 1, 2, 8, 10, 17: Atomic transition with OCC and locking
   */
  async handlePaymentCaptured(correlationId: string, escrowId: number): Promise<void> {
    const sagaId = `escrow_saga_${escrowId}`;
    
    await AtomicSagaExecutor.execute({
      sagaId,
      correlationId,
      sagaType: this.SAGA_TYPE,
      operation: async (tx) => {
        const state = await this.ensureSagaState(sagaId, correlationId);
        
        if (state.currentStep === "COMPLETED") return;

        this.validateTransition(state.currentStep, "COMPLETED");

        const newState: EscrowSagaState = {
          ...state,
          currentStep: "COMPLETED",
          history: [...state.history, { step: "COMPLETED", timestamp: this.clock.now() }]
        };

        await SagaManager.saveState({
          sagaId,
          type: this.SAGA_TYPE,
          status: "COMPLETED",
          state: newState,
          correlationId,
          tx
        });

        sagaTotalCounter.inc({ type: this.SAGA_TYPE, status: "COMPLETED" });
        sagaActiveGauge.dec({ type: this.SAGA_TYPE });

        await this.publishEvent("escrow.saga.completed", escrowId, {
          escrowId,
          status: "LOCKED",
          timestamp: this.clock.now()
        }, correlationId, `saga_completed_${correlationId}`, tx);
      }
    });
  }

  /**
   * Handle Failure & Compensation (Rule 4)
   * Improvement 1, 2, 8, 10, 17: Atomic transition with OCC and locking
   */
  async handleFailure(correlationId: string, escrowId: number, reason: string): Promise<void> {
    const sagaId = `escrow_saga_${escrowId}`;
    
    await AtomicSagaExecutor.execute({
      sagaId,
      correlationId,
      sagaType: this.SAGA_TYPE,
      operation: async (tx) => {
        const state = await this.ensureSagaState(sagaId, correlationId);
        
        if (state.currentStep === "FAILED" || state.currentStep === "COMPENSATING") return;

        Logger.error(`[EscrowSaga][CID:${correlationId}] Failure detected: ${reason}. Starting compensation.`);

        const compensatingState: EscrowSagaState = {
          ...state,
          failureReason: reason,
          currentStep: "COMPENSATING",
          history: [...state.history, { step: "COMPENSATING", timestamp: this.clock.now(), metadata: { reason } }]
        };

        await SagaManager.saveState({
          sagaId,
          type: this.SAGA_TYPE,
          status: "COMPENSATING",
          state: compensatingState,
          correlationId,
          tx
        });

        if (state.paymentId) {
            await this.publishEvent("payment.refund.requested", escrowId, {
                paymentId: state.paymentId,
                reason: `Saga Failure: ${reason}`
            }, correlationId, `compensation_refund_${correlationId}`, tx);
        } else {
            // No payment to refund, move directly to FAILED
            await this.markAsFailed(correlationId, escrowId, reason, compensatingState, tx);
        }
      }
    });
  }

  /**
   * Handle Compensation Completed (Rule 4)
   * Improvement 1, 2, 8, 10, 17: Atomic transition with OCC and locking
   */
  async handleCompensated(correlationId: string, escrowId: number): Promise<void> {
    const sagaId = `escrow_saga_${escrowId}`;
    
    await AtomicSagaExecutor.execute({
      sagaId,
      correlationId,
      sagaType: this.SAGA_TYPE,
      operation: async (tx) => {
        const state = await this.ensureSagaState(sagaId, correlationId);
        
        if (state.currentStep === "COMPENSATED") return;

        const compensatedState: EscrowSagaState = {
          ...state,
          currentStep: "COMPENSATED",
          history: [...state.history, { step: "COMPENSATED", timestamp: this.clock.now() }]
        };

        await SagaManager.saveState({
          sagaId,
          type: this.SAGA_TYPE,
          status: "COMPENSATED",
          state: compensatedState,
          correlationId,
          tx
        });

        await this.markAsFailed(correlationId, escrowId, state.failureReason || "Compensated", compensatedState, tx);
      }
    });
  }

  private async markAsFailed(correlationId: string, escrowId: number, reason: string, currentState: EscrowSagaState, tx?: any): Promise<void> {
    const sagaId = `escrow_saga_${escrowId}`;
    const failedState: EscrowSagaState = {
      ...currentState,
      currentStep: "FAILED",
      history: [...currentState.history, { step: "FAILED", timestamp: this.clock.now() }]
    };

    await SagaManager.saveState({
      sagaId,
      type: this.SAGA_TYPE,
      status: "FAILED",
      state: failedState,
      correlationId,
      tx
    });

    sagaTotalCounter.inc({ type: this.SAGA_TYPE, status: "FAILED" });
    sagaActiveGauge.dec({ type: this.SAGA_TYPE });
  }

  private async ensureSagaState(sagaId: string, correlationId: string): Promise<EscrowSagaState> {
    const state = await SagaManager.getState<EscrowSagaState>(sagaId);
    if (!state) {
        throw new Error(`[EscrowSaga][CID:${correlationId}] Saga state not found for ${sagaId}`);
    }
    return state;
  }

  private validateTransition(current: string, next: string) {
    const allowed: Record<string, string[]> = {
        "INITIALIZING": ["AUTHORIZED", "FAILED", "COMPENSATING"],
        "AUTHORIZED": ["COMPLETED", "COMPENSATING", "FAILED"],
        "COMPENSATING": ["COMPENSATED", "FAILED"],
        "COMPENSATED": ["FAILED"]
    };
    if (!allowed[current]?.includes(next)) {
        throw new Error(`Invalid state transition from ${current} to ${next}`);
    }
  }

  private async publishEvent<T extends keyof typeof EventSchemas>(
    type: T, 
    aggregateId: number, 
    payload: z.infer<typeof EventSchemas[T]>, 
    correlationId: string,
    idempotencyKey: string,
    tx?: any
  ) {
    const eventId = uuidv4();
    const header = {
        eventId,
        eventType: type,
        aggregateType: "escrow",
        aggregateId,
        version: 1,
        correlationId,
        timestamp: this.clock.now(),
        idempotencyKey
    };

    const validated = validateEvent(type, header, payload);

    // Improvement 8: Atomic Outbox + DB transaction
    await this.escrowRepo.saveOutboxEvent({
        ...validated,
        status: "pending",
        retries: 0
    } as any, tx);
  }
}
