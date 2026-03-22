import { IEscrowRepository } from "../domain/IEscrowRepository";
import { Escrow } from "../domain/Escrow";
import { v4 as uuidv4 } from 'uuid';
import { SagaManager } from "../../../core/events/SagaManager";
import { Logger } from "../../../core/observability/Logger";
import { validateEvent, EventSchemas } from "../../../core/events/EventContract";
import { z } from "zod";
import { EscrowSagaState, SagaStatus } from "../../../core/events/SagaTypes";

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
    });

    await this.publishEvent("escrow.created", escrowId, {
      escrowId,
      buyerId: input.buyerId,
      sellerId: input.sellerId,
      amount: input.amount,
      currency: "SAR"
    }, correlationId, `escrow_created_${escrowId}`);

    return correlationId;
  }

  /**
   * Handle Payment Authorized
   */
  async handlePaymentAuthorized(correlationId: string, escrowId: number, paymentId: string): Promise<void> {
    const sagaId = `escrow_saga_${escrowId}`;
    const state = await this.ensureSagaState(sagaId, correlationId);
    
    if (state.currentStep === "AUTHORIZED" || state.currentStep === "COMPLETED") return;

    this.validateTransition(state.currentStep, "AUTHORIZED");

    const escrow = await this.escrowRepo.getById(escrowId);
    if (!escrow) throw new Error(`Escrow #${escrowId} not found`);

    if (escrow.canBeLocked()) {
        escrow.lock();
        await this.escrowRepo.update(escrow);
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
    });

    await this.publishEvent("payment.capture.requested", escrowId, {
      paymentId,
      escrowId
    }, correlationId, `payment_capture_req_${correlationId}`);
  }

  /**
   * Handle Payment Captured
   */
  async handlePaymentCaptured(correlationId: string, escrowId: number): Promise<void> {
    const sagaId = `escrow_saga_${escrowId}`;
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
    });

    await this.publishEvent("escrow.saga.completed", escrowId, {
      escrowId,
      status: "LOCKED",
      timestamp: this.clock.now()
    }, correlationId, `saga_completed_${correlationId}`);
  }

  /**
   * Handle Failure & Compensation (Rule 4)
   */
  async handleFailure(correlationId: string, escrowId: number, reason: string): Promise<void> {
    const sagaId = `escrow_saga_${escrowId}`;
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
    });

    if (state.paymentId) {
        await this.publishEvent("payment.refund.requested", escrowId, {
            paymentId: state.paymentId,
            reason: `Saga Failure: ${reason}`
        }, correlationId, `compensation_refund_${correlationId}`);
    } else {
        // No payment to refund, move directly to FAILED
        await this.markAsFailed(correlationId, escrowId, reason, compensatingState);
    }
  }

  /**
   * Handle Compensation Completed (Rule 4)
   */
  async handleCompensated(correlationId: string, escrowId: number): Promise<void> {
    const sagaId = `escrow_saga_${escrowId}`;
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
    });

    await this.markAsFailed(correlationId, escrowId, state.failureReason || "Compensated", compensatedState);
  }

  private async markAsFailed(correlationId: string, escrowId: number, reason: string, currentState: EscrowSagaState): Promise<void> {
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
    });
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
    idempotencyKey: string
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

    await this.escrowRepo.saveOutboxEvent({
        ...validated,
        status: "pending",
        retries: 0
    } as any);
  }
}
