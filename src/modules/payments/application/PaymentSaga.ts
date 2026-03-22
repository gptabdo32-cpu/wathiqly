import { IPaymentProvider } from "../domain/IPaymentProvider";
import { v4 as uuidv4 } from 'uuid';
import { SagaManager } from "../../../core/events/SagaManager";
import { Logger } from "../../../core/observability/Logger";
import { validateEvent, EventSchemas } from "../../../core/events/EventContract";
import { z } from "zod";
import { PaymentSagaState } from "../../../core/events/SagaTypes";

/**
 * PaymentSaga Orchestrator (Rule 11: Expand Payment domain)
 * MISSION: Handle multi-stage payment lifecycle (Authorize -> Capture -> Refund)
 * RULE 1: Every Saga MUST be a full state machine
 * RULE 3: Typed Saga State (CRITICAL)
 * RULE 8: Add compensation flows for every failure
 * RULE 10: Deterministic Time Handling
 */
export class PaymentSaga {
  private readonly SAGA_TYPE = "PaymentSaga";

  constructor(
    private paymentProvider: IPaymentProvider,
    private clock: { now: () => string } = { now: () => new Date().toISOString() }
  ) {}

  /**
   * Step 1: Authorize Funds
   */
  async handleAuthorizeRequested(data: {
    correlationId: string;
    escrowId: number;
    amount: string;
    buyerId: number;
  }): Promise<void> {
    const { correlationId, escrowId, amount, buyerId } = data;
    const sagaId = `payment_saga_${escrowId}`;
    
    const existingState = await SagaManager.getState<PaymentSagaState>(sagaId);
    if (existingState && existingState.currentStep !== "FAILED") {
        Logger.info(`[PaymentSaga][CID:${correlationId}] Authorization already in progress or completed for Escrow #${escrowId}`);
        return;
    }

    const initialState: PaymentSagaState = {
      escrowId,
      amount,
      buyerId,
      currentStep: "AUTHORIZING",
      history: [{ step: "AUTHORIZING", timestamp: this.clock.now() }]
    };

    await SagaManager.saveState({
      sagaId,
      type: this.SAGA_TYPE,
      status: "STARTED",
      state: initialState,
      correlationId,
    });

    try {
      Logger.info(`[PaymentSaga][CID:${correlationId}] Requesting authorization for Escrow #${escrowId}: ${amount}`);
      
      const result = await this.paymentProvider.authorize({
        amount,
        currency: "SAR",
        sourceId: `user_${buyerId}`,
        idempotencyKey: `auth_${correlationId}`
      });

      if (result.success && result.transactionId) {
        const authorizedState: PaymentSagaState = {
          ...initialState,
          paymentId: result.transactionId,
          currentStep: "AUTHORIZED",
          history: [...initialState.history, { step: "AUTHORIZED", timestamp: this.clock.now() }]
        };

        await SagaManager.saveState({
          sagaId,
          type: this.SAGA_TYPE,
          status: "AUTHORIZED",
          state: authorizedState,
          correlationId,
        });

        await this.publishEvent("payment.authorized", escrowId, {
          paymentId: result.transactionId,
          escrowId,
          amount
        }, correlationId, `payment_auth_success_${correlationId}`);
      } else {
        throw new Error(result.error || "Authorization failed");
      }
    } catch (error: any) {
      await this.handleFailure(correlationId, escrowId, error.message);
    }
  }

  /**
   * Step 2: Capture Funds
   */
  async handleCaptureRequested(correlationId: string, escrowId: number, paymentId: string): Promise<void> {
    const sagaId = `payment_saga_${escrowId}`;
    const state = await SagaManager.getState<PaymentSagaState>(sagaId);
    
    if (!state || state.currentStep !== "AUTHORIZED") {
        Logger.error(`[PaymentSaga][CID:${correlationId}] Invalid state for capture: ${state?.currentStep}`);
        return;
    }

    const capturingState: PaymentSagaState = {
      ...state,
      currentStep: "CAPTURING",
      history: [...state.history, { step: "CAPTURING", timestamp: this.clock.now() }]
    };

    await SagaManager.saveState({
      sagaId,
      type: this.SAGA_TYPE,
      status: "CAPTURING",
      state: capturingState,
      correlationId,
    });

    try {
      const result = await (this.paymentProvider as any).capture({
        paymentId,
        idempotencyKey: `capture_${correlationId}`
      });

      if (result.success) {
        const capturedState: PaymentSagaState = {
          ...capturingState,
          currentStep: "CAPTURED",
          history: [...capturingState.history, { step: "CAPTURED", timestamp: this.clock.now() }]
        };

        await SagaManager.saveState({
          sagaId,
          type: this.SAGA_TYPE,
          status: "COMPLETED",
          state: capturedState,
          correlationId,
        });

        await this.publishEvent("payment.captured", escrowId, {
          paymentId,
          escrowId,
          capturedAmount: state.amount
        }, correlationId, `payment_capture_success_${correlationId}`);
      } else {
        throw new Error(result.error || "Capture failed");
      }
    } catch (error: any) {
      await this.handleFailure(correlationId, escrowId, error.message);
    }
  }

  /**
   * Step 3: Refund/Void (Compensation)
   */
  async handleRefundRequested(correlationId: string, escrowId: number, paymentId: string, reason: string): Promise<void> {
    const sagaId = `payment_saga_${escrowId}`;
    const state = await SagaManager.getState<PaymentSagaState>(sagaId);
    
    Logger.info(`[PaymentSaga][CID:${correlationId}] Processing refund for Escrow #${escrowId}: ${reason}`);

    const compensatingState: PaymentSagaState = {
      ...(state || { escrowId, amount: "0", buyerId: 0, currentStep: "UNKNOWN", history: [] }),
      currentStep: "COMPENSATING",
      history: [...(state?.history || []), { step: "COMPENSATING", timestamp: this.clock.now(), metadata: { reason } }]
    };

    await SagaManager.saveState({
      sagaId,
      type: this.SAGA_TYPE,
      status: "COMPENSATING",
      state: compensatingState,
      correlationId,
    });

    try {
      const result = await this.paymentProvider.refund({
        transactionId: paymentId,
        amount: "0", // Full refund
        reason,
        idempotencyKey: `refund_${correlationId}`
      });

      if (result.success) {
        const compensatedState: PaymentSagaState = {
          ...compensatingState,
          currentStep: "COMPENSATED",
          refundId: result.transactionId,
          history: [...compensatingState.history, { step: "COMPENSATED", timestamp: this.clock.now() }]
        };

        await SagaManager.saveState({
          sagaId,
          type: this.SAGA_TYPE,
          status: "COMPENSATED",
          state: compensatedState,
          correlationId,
        });

        // Notify EscrowSaga that compensation is done
        await this.publishEvent("payment.failed", escrowId, {
          escrowId,
          reason: `Refunded: ${reason}`
        }, correlationId, `payment_refund_success_${correlationId}`);
      } else {
        throw new Error(result.error || "Refund failed");
      }
    } catch (error: any) {
      Logger.error(`[PaymentSaga][CID:${correlationId}] CRITICAL: Refund failed: ${error.message}`);
      // This is a critical failure that might need manual intervention or a reconciliation engine
    }
  }

  private async handleFailure(correlationId: string, escrowId: number, reason: string): Promise<void> {
    const sagaId = `payment_saga_${escrowId}`;
    const state = await SagaManager.getState<PaymentSagaState>(sagaId);

    const failedState: PaymentSagaState = {
      ...(state || { escrowId, amount: "0", buyerId: 0, currentStep: "UNKNOWN", history: [] }),
      failureReason: reason,
      currentStep: "FAILED",
      history: [...(state?.history || []), { step: "FAILED", timestamp: this.clock.now(), metadata: { reason } }]
    };

    await SagaManager.saveState({
      sagaId,
      type: this.SAGA_TYPE,
      status: "FAILED",
      state: failedState,
      correlationId,
    });

    await this.publishEvent("payment.failed", escrowId, {
      escrowId,
      reason
    }, correlationId, `payment_fail_${correlationId}`);
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
        aggregateType: "payment",
        aggregateId,
        version: 1,
        correlationId,
        timestamp: this.clock.now(),
        idempotencyKey
    };

    const validated = validateEvent(type, header, payload);

    // In a real system, this would go to an outbox table
    Logger.info(`[PaymentSaga] Publishing event ${type} to outbox`, { ...validated, status: "pending" });
  }
}
