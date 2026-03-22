import { IPaymentProvider } from "../domain/IPaymentProvider";
import { IPaymentRepository } from "../domain/IPaymentRepository";
import { v4 as uuidv4 } from 'uuid';
import { SagaManager } from "../../../core/events/SagaManager";
import { AtomicSagaExecutor } from "../../../core/events/AtomicSagaExecutor";
import { Logger } from "../../../core/observability/Logger";
import { validateEvent, EventSchemas } from "../../../core/events/EventContract";
import { z } from "zod";
import { PaymentSagaState, SagaStatus } from "../../../core/events/SagaTypes";

/**
 * PaymentSaga Orchestrator (Rule 11: Expand Payment domain)
 * MISSION: Handle multi-stage payment lifecycle (Authorize -> Capture -> Refund)
 * IMPROVEMENTS: 1, 2, 8, 10, 17, 18 (Atomic, OCC, Transactions, Locking, Tracing)
 */
export class PaymentSaga {
  private readonly SAGA_TYPE = "PaymentSaga";

  constructor(
    private paymentProvider: IPaymentProvider,
    private paymentRepo: IPaymentRepository,
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
    
    await AtomicSagaExecutor.execute({
      sagaId,
      correlationId,
      sagaType: this.SAGA_TYPE,
      operation: async (tx) => {
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
          tx
        });

        try {
          Logger.info(`[PaymentSaga][CID:${correlationId}] Requesting authorization for Escrow #${escrowId}: ${amount}`);
          
          // Side effect: External call (Idempotent via correlationId)
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
              tx
            });

            await this.publishEvent("payment.authorized", escrowId, {
              paymentId: result.transactionId,
              escrowId,
              amount
            }, correlationId, `payment_auth_success_${correlationId}`, tx);
          } else {
            throw new Error(result.error || "Authorization failed");
          }
        } catch (error: any) {
          await this.handleFailure(correlationId, escrowId, error.message, tx);
        }
      }
    });
  }

  /**
   * Step 2: Capture Funds
   */
  async handleCaptureRequested(correlationId: string, escrowId: number, paymentId: string): Promise<void> {
    const sagaId = `payment_saga_${escrowId}`;
    
    await AtomicSagaExecutor.execute({
      sagaId,
      correlationId,
      sagaType: this.SAGA_TYPE,
      operation: async (tx) => {
        const state = await this.ensureSagaState(sagaId, correlationId);
        
        if (state.currentStep === "CAPTURED" || state.currentStep === "COMPLETED") return;
        if (state.currentStep !== "AUTHORIZED") {
            Logger.error(`[PaymentSaga][CID:${correlationId}] Invalid state for capture: ${state.currentStep}`);
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
          tx
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
              tx
            });

            await this.publishEvent("payment.captured", escrowId, {
              paymentId,
              escrowId,
              capturedAmount: state.amount
            }, correlationId, `payment_capture_success_${correlationId}`, tx);
          } else {
            throw new Error(result.error || "Capture failed");
          }
        } catch (error: any) {
          await this.handleFailure(correlationId, escrowId, error.message, tx);
        }
      }
    });
  }

  /**
   * Step 3: Refund/Void (Compensation)
   */
  async handleRefundRequested(correlationId: string, escrowId: number, paymentId: string, reason: string): Promise<void> {
    const sagaId = `payment_saga_${escrowId}`;
    
    await AtomicSagaExecutor.execute({
      sagaId,
      correlationId,
      sagaType: this.SAGA_TYPE,
      operation: async (tx) => {
        const state = await SagaManager.getState<PaymentSagaState>(sagaId);
        
        if (state?.currentStep === "COMPENSATED") return;

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
          tx
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
              tx
            });

            await this.publishEvent("payment.failed", escrowId, {
              escrowId,
              reason: `Refunded: ${reason}`
            }, correlationId, `payment_refund_success_${correlationId}`, tx);
          } else {
            throw new Error(result.error || "Refund failed");
          }
        } catch (error: any) {
          Logger.error(`[PaymentSaga][CID:${correlationId}] CRITICAL: Refund failed: ${error.message}`);
          throw error; // Rethrow to allow retry or manual intervention
        }
      }
    });
  }

  private async handleFailure(correlationId: string, escrowId: number, reason: string, tx?: any): Promise<void> {
    const sagaId = `payment_saga_${escrowId}`;
    const state = await SagaManager.getState<PaymentSagaState>(sagaId);

    if (state?.currentStep === "FAILED") return;

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
      tx
    });

    await this.publishEvent("payment.failed", escrowId, {
      escrowId,
      reason
    }, correlationId, `payment_fail_${correlationId}`, tx);
  }

  private async ensureSagaState(sagaId: string, correlationId: string): Promise<PaymentSagaState> {
    const state = await SagaManager.getState<PaymentSagaState>(sagaId);
    if (!state) {
        throw new Error(`[PaymentSaga][CID:${correlationId}] Saga state not found for ${sagaId}`);
    }
    return state;
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
        aggregateType: "payment",
        aggregateId,
        version: 1,
        correlationId,
        timestamp: this.clock.now(),
        idempotencyKey
    };

    const validated = validateEvent(type, header, payload);

    // Improvement 8: Atomic Outbox + DB transaction
    await this.paymentRepo.saveOutboxEvent({
        ...validated,
        status: "pending",
        retries: 0
    } as any, tx);
  }
}
