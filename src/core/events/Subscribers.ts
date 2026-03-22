import { eventBus } from "./EventBus";
import { Logger } from "../observability/Logger";
import { Container } from "../di/container";
import { EscrowSaga } from "../../modules/escrow/application/EscrowSaga";
import { PaymentSaga } from "../../modules/payments/application/PaymentSaga";
import { StripePaymentProvider } from "../../modules/payments/infrastructure/StripePaymentProvider";
import { publishToQueue } from "./EventQueue";

/**
 * Initialize all system-wide subscribers.
 * MISSION: Deterministic distributed financial system
 * RULE 2: Introduce real event-driven communication
 * RULE 17: Enforce module boundaries (No direct cross-module logic, use Sagas)
 */
export function initializeSubscribers() {
  
  // 1. Escrow Saga Handlers (Distributed State Machine)
  // RULE 9: Convert workflows into saga state machines
  
  eventBus.subscribe("EscrowCreated", async (data: any) => {
    const correlationId = data.correlationId;
    Logger.info(`[Saga][CID:${correlationId}] Reacting to EscrowCreated. Triggering Payment...`);
    
    try {
      // RULE 3: Replace direct service calls with event publishing
      // RULE 4: Implement message queue (Publish to queue instead of direct bus)
      await publishToQueue({
        event: "LockFundsCommand",
        payload: {
          escrowId: data.escrowId,
          buyerId: data.buyerId,
          amount: data.amount,
        },
        correlationId,
        idempotencyKey: `lock_funds_${data.escrowId}_${correlationId}`
      });
    } catch (error: any) {
      Logger.error(`[Saga][CID:${correlationId}] Failed to trigger Payment`, error);
      throw error; // Rule 15: Prevent silent failures
    }
  });

  // 2. Payment Module Handlers (Rule 9: Saga State Machines)
  const paymentProvider = new StripePaymentProvider(); // Rule 11: Real provider
  const paymentSaga = new PaymentSaga(paymentProvider);

  eventBus.subscribe("LockFundsCommand", async (data: any) => {
    // Rule 1: Remove all synchronous cross-module calls
    // Rule 17: Enforce module boundaries
    await paymentSaga.handleLockFunds(data);
  });

  // 3. Saga Completion Handlers
  eventBus.subscribe("PaymentCompleted", async (data: any) => {
    const correlationId = data.correlationId;
    const saga = Container.get(EscrowSaga);
    await saga.handlePaymentCompleted(correlationId, data.escrowLedgerAccountId);
  });

  eventBus.subscribe("PaymentFailed", async (data: any) => {
    const correlationId = data.correlationId;
    const saga = Container.get(EscrowSaga);
    await saga.handlePaymentFailed(correlationId, data.reason);
  });

  Logger.info("[EventBus] All subscribers initialized (Saga Mode)");
}
