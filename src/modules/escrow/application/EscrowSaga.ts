import { IEscrowRepository } from "../domain/IEscrowRepository";
import { Escrow } from "../domain/Escrow";
import { v4 as uuidv4 } from 'uuid';
import { SagaManager } from "../../../core/events/SagaManager";
import { Logger } from "../../../core/observability/Logger";
import { validateEvent, EventSchemas } from "../../../core/events/EventContract";
import { z } from "zod";

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
 * RULE 3: No Saga should end without explicit completion
 * RULE 7: Implement Saga resume logic
 * RULE 8: Add compensation flows for every failure
 * RULE 9: Enforce strict state transitions
 */
export class EscrowSaga {
  private readonly SAGA_TYPE = "EscrowSaga";

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

    // Rule 8: Save saga state as a state machine
    await SagaManager.saveState({
      sagaId,
      type: this.SAGA_TYPE,
      status: "STARTED",
      state: { 
        ...input, 
        escrowId, 
        currentStep: "INITIALIZING",
        history: [{ step: "INITIALIZING", timestamp: new Date().toISOString() }]
      },
      correlationId,
    });

    // Rule 2: Every event MUST trigger a next step
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
   * Handle Payment Authorized (Next step after escrow.created -> payment.authorize.requested)
   */
  async handlePaymentAuthorized(correlationId: string, escrowId: number, paymentId: string): Promise<void> {
    const sagaId = `escrow_saga_${escrowId}`;
    const state = await this.ensureSagaState(sagaId, correlationId);
    
    if (state.status === "COMPLETED" || state.currentStep === "PAYMENT_AUTHORIZED") return;

    // Rule 9: Strict state transition
    this.validateTransition(state.currentStep as string, "PAYMENT_AUTHORIZED");

    const escrow = await this.escrowRepo.getById(escrowId);
    if (!escrow) throw new Error(`Escrow #${escrowId} not found`);

    // Update Escrow Domain
    if (escrow.canBeLocked()) {
        escrow.lock();
        await this.escrowRepo.update(escrow);
    }

    // Update Saga State
    await SagaManager.saveState({
      sagaId,
      type: this.SAGA_TYPE,
      status: "PROCESSING",
      state: { 
        ...state, 
        currentStep: "PAYMENT_AUTHORIZED", 
        paymentId,
        history: [...(state.history as any[]), { step: "PAYMENT_AUTHORIZED", timestamp: new Date().toISOString() }]
      },
      correlationId,
    });

    // Rule 2: Trigger next step (Capture)
    await this.publishEvent("payment.capture.requested", escrowId, {
      paymentId,
      escrowId
    }, correlationId, `payment_capture_req_${correlationId}`);
  }

  /**
   * Handle Payment Captured (Final Success Step)
   */
  async handlePaymentCaptured(correlationId: string, escrowId: number): Promise<void> {
    const sagaId = `escrow_saga_${escrowId}`;
    const state = await this.ensureSagaState(sagaId, correlationId);
    
    if (state.status === "COMPLETED") return;

    await SagaManager.saveState({
      sagaId,
      type: this.SAGA_TYPE,
      status: "COMPLETED",
      state: { 
        ...state, 
        currentStep: "COMPLETED",
        history: [...(state.history as any[]), { step: "COMPLETED", timestamp: new Date().toISOString() }]
      },
      correlationId,
    });

    await this.publishEvent("escrow.saga.completed", escrowId, {
      escrowId,
      status: "LOCKED",
      timestamp: new Date().toISOString()
    }, correlationId, `saga_completed_${correlationId}`);
  }

  /**
   * Handle Failure & Compensation (Rule 8)
   */
  async handleFailure(correlationId: string, escrowId: number, reason: string): Promise<void> {
    const sagaId = `escrow_saga_${escrowId}`;
    const state = await this.ensureSagaState(sagaId, correlationId);
    
    if (state.status === "FAILED" || state.status === "COMPENSATING") return;

    Logger.error(`[EscrowSaga][CID:${correlationId}] Failure detected: ${reason}. Starting compensation.`);

    await SagaManager.saveState({
      sagaId,
      type: this.SAGA_TYPE,
      status: "COMPENSATING",
      state: { ...state, failureReason: reason, currentStep: "COMPENSATING" },
      correlationId,
    });

    // Compensation Logic: If payment was authorized, we might need to void/refund
    if (state.paymentId) {
        await this.publishEvent("payment.refund.requested", escrowId, {
            paymentId: state.paymentId as string,
            reason: `Saga Failure: ${reason}`
        }, correlationId, `compensation_refund_${correlationId}`);
    }

    // Mark as FAILED after compensation triggers
    await SagaManager.saveState({
        sagaId,
        type: this.SAGA_TYPE,
        status: "FAILED",
        state: { ...state, status: "FAILED", currentStep: "FAILED" },
        correlationId,
    });
  }

  private async ensureSagaState(sagaId: string, correlationId: string): Promise<Record<string, unknown>> {
    const state = await SagaManager.getState<Record<string, unknown>>(sagaId);
    if (!state) {
        throw new Error(`[EscrowSaga][CID:${correlationId}] Saga state not found for ${sagaId}`);
    }
    return state;
  }

  private validateTransition(current: string, next: string) {
    const allowed: Record<string, string[]> = {
        "INITIALIZING": ["PAYMENT_AUTHORIZED", "FAILED"],
        "PAYMENT_AUTHORIZED": ["COMPLETED", "FAILED"],
        "COMPENSATING": ["FAILED"]
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
        timestamp: new Date().toISOString(),
        idempotencyKey
    };

    // Rule 18: Schema validation
    const validated = validateEvent(type, header, payload);

    await this.escrowRepo.saveOutboxEvent({
        ...validated,
        status: "pending",
        retries: 0
    } as any);
  }
}
