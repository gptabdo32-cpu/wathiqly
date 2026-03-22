import { eventBus } from "./EventBus";
import { container } from "../di/container";
import { EscrowSaga } from "../../modules/escrow/application/EscrowSaga";
import { PaymentSaga } from "../../modules/payments/application/PaymentSaga";
import { Logger } from "../observability/Logger";
import { IdempotencyManager } from "./IdempotencyManager";
import { ReplayIsolation } from "./ReplayIsolation";

/**
 * Event Subscribers (Rule 2, 12)
 * MISSION: Wire up the closed-loop, deterministic event-driven engine.
 * IMPROVEMENTS: 4, 5, 11 (Idempotent Consumers, Replay Isolation, Deduplication)
 */
export function initializeSubscribers() {
  // Use DI container to get saga instances
  const escrowSaga = container.get<EscrowSaga>("EscrowSaga");
  const paymentSaga = container.get<PaymentSaga>("PaymentSaga");
  const replayIsolation = new ReplayIsolation();

  /**
   * Wrapper to enforce idempotency and replay isolation for all subscribers.
   */
  const withReliability = (
    subscriberName: string,
    handler: (data: any) => Promise<any>
  ) => {
    return async (data: any) => {
      const { correlationId, idempotencyKey, eventId } = data;
      const consumerKey = `${subscriberName}:${idempotencyKey}`;

      // Improvement 5: Isolate side effects during Event Replay
      if (replayIsolation.isInReplay()) {
        Logger.info(`[Subscriber:${subscriberName}][CID:${correlationId}] Skipping side effects during replay`);
        // In a real system, we might want to still run state-only updates
        // but for now we follow the strict rule: NO external calls during replay.
        return;
      }

      // Improvement 4, 11: Idempotent Consumers with strict enforcement
      const idempotency = await IdempotencyManager.checkIdempotency({
        idempotencyKey: consumerKey,
        correlationId
      });

      if (idempotency.isDuplicate) {
        Logger.info(`[Subscriber:${subscriberName}][CID:${correlationId}] Duplicate event detected, skipping: ${idempotencyKey}`);
        return idempotency.result;
      }

      try {
        // Mark as processing
        await IdempotencyManager.markProcessing({
          idempotencyKey: consumerKey,
          eventId: eventId || 'unknown',
          aggregateId: data.escrowId || 0,
          aggregateType: 'subscriber',
          eventType: subscriberName,
          correlationId
        });

        // Execute actual handler
        const result = await handler(data);

        // Mark as completed
        await IdempotencyManager.markCompleted({
          idempotencyKey: consumerKey,
          result: result || { success: true },
          correlationId
        });

        return result;
      } catch (error: any) {
        // Mark as failed so it can be retried
        await IdempotencyManager.markFailed({
          idempotencyKey: consumerKey,
          error: error.message,
          correlationId
        });
        throw error;
      }
    };
  };

  // --- Escrow Flow ---

  /**
   * 1. Escrow Created -> Request Payment Authorization
   */
  eventBus.subscribe("escrow.created", withReliability("EscrowCreatedHandler", async (data) => {
    const { correlationId } = data;
    Logger.info(`[Subscriber] EscrowCreated -> Requesting Payment Authorization [CID:${correlationId}]`);
    
    await paymentSaga.handleAuthorizeRequested({
      correlationId,
      escrowId: data.escrowId as number,
      amount: data.amount as string,
      buyerId: data.buyerId as number
    });
  }));

  /**
   * 2. Payment Authorized -> Update Escrow Saga
   */
  eventBus.subscribe("payment.authorized", withReliability("PaymentAuthorizedHandler", async (data) => {
    const { correlationId } = data;
    Logger.info(`[Subscriber] PaymentAuthorized -> Updating Escrow Saga [CID:${correlationId}]`);
    
    await escrowSaga.handlePaymentAuthorized(
      correlationId,
      data.escrowId as number,
      data.paymentId as string
    );
  }));

  /**
   * 3. Payment Capture Requested -> Execute Capture in Payment Saga
   */
  eventBus.subscribe("payment.capture.requested", withReliability("PaymentCaptureRequestedHandler", async (data) => {
    const { correlationId } = data;
    Logger.info(`[Subscriber] PaymentCaptureRequested -> Executing Capture [CID:${correlationId}]`);
    
    await paymentSaga.handleCaptureRequested(
      correlationId,
      data.escrowId as number,
      data.paymentId as string
    );
  }));

  /**
   * 4. Payment Captured -> Finalize Escrow Saga
   */
  eventBus.subscribe("payment.captured", withReliability("PaymentCapturedHandler", async (data) => {
    const { correlationId } = data;
    Logger.info(`[Subscriber] PaymentCaptured -> Finalizing Escrow Saga [CID:${correlationId}]`);
    
    await escrowSaga.handlePaymentCaptured(
      correlationId,
      data.escrowId as number
    );
  }));

  /**
   * 5. Payment Failed -> Trigger Failure in Escrow Saga
   */
  eventBus.subscribe("payment.failed", withReliability("PaymentFailedHandler", async (data) => {
    const { correlationId } = data;
    Logger.info(`[Subscriber] PaymentFailed -> Handling Failure in Escrow Saga [CID:${correlationId}]`);
    
    await escrowSaga.handleFailure(
      correlationId,
      data.escrowId as number,
      data.reason as string
    );
  }));

  /**
   * 6. Refund Requested -> Execute Refund in Payment Saga
   */
  eventBus.subscribe("payment.refund.requested", withReliability("PaymentRefundRequestedHandler", async (data) => {
    const { correlationId } = data;
    Logger.info(`[Subscriber] RefundRequested -> Executing Refund [CID:${correlationId}]`);
    
    await paymentSaga.handleRefundRequested(
      correlationId,
      data.escrowId as number || 0,
      data.paymentId as string,
      data.reason as string
    );
  }));

  Logger.info("Event Subscribers initialized with Bank-Grade reliability (Idempotency + Replay Isolation).");
}
