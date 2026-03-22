import { eventBus } from "./EventBus";
import { container } from "../di/container";
import { EscrowSaga } from "../../modules/escrow/application/EscrowSaga";
import { PaymentSaga } from "../../modules/payments/application/PaymentSaga";
import { Logger } from "../observability/Logger";

/**
 * Event Subscribers (Rule 2, 12)
 * MISSION: Wire up the closed-loop, deterministic event-driven engine.
 * RULE 2: Every event MUST trigger a next step
 * RULE 12: Ensure all flows are event-driven (no hidden sync)
 */
export function initializeSubscribers() {
  // Use DI container to get saga instances
  const escrowSaga = container.get<EscrowSaga>("EscrowSaga");
  const paymentSaga = container.get<PaymentSaga>("PaymentSaga");

  // --- Escrow Flow ---

  /**
   * 1. Escrow Created -> Request Payment Authorization
   */
  eventBus.subscribe("escrow.created", async (data) => {
    const { payload, correlationId } = data;
    Logger.info(`[Subscriber] EscrowCreated -> Requesting Payment Authorization [CID:${correlationId}]`);
    
    await paymentSaga.handleAuthorizeRequested({
      correlationId,
      escrowId: payload.escrowId as number,
      amount: payload.amount as string,
      buyerId: payload.buyerId as number
    });
  });

  /**
   * 2. Payment Authorized -> Update Escrow Saga
   */
  eventBus.subscribe("payment.authorized", async (data) => {
    const { payload, correlationId } = data;
    Logger.info(`[Subscriber] PaymentAuthorized -> Updating Escrow Saga [CID:${correlationId}]`);
    
    await escrowSaga.handlePaymentAuthorized(
      correlationId,
      payload.escrowId as number,
      payload.paymentId as string
    );
  });

  /**
   * 3. Payment Capture Requested -> Execute Capture in Payment Saga
   */
  eventBus.subscribe("payment.capture.requested", async (data) => {
    const { payload, correlationId } = data;
    Logger.info(`[Subscriber] PaymentCaptureRequested -> Executing Capture [CID:${correlationId}]`);
    
    await paymentSaga.handleCaptureRequested(
      correlationId,
      payload.escrowId as number,
      payload.paymentId as string
    );
  });

  /**
   * 4. Payment Captured -> Finalize Escrow Saga
   */
  eventBus.subscribe("payment.captured", async (data) => {
    const { payload, correlationId } = data;
    Logger.info(`[Subscriber] PaymentCaptured -> Finalizing Escrow Saga [CID:${correlationId}]`);
    
    await escrowSaga.handlePaymentCaptured(
      correlationId,
      payload.escrowId as number
    );
  });

  /**
   * 5. Payment Failed -> Trigger Failure in Escrow Saga
   */
  eventBus.subscribe("payment.failed", async (data) => {
    const { payload, correlationId } = data;
    Logger.info(`[Subscriber] PaymentFailed -> Handling Failure in Escrow Saga [CID:${correlationId}]`);
    
    await escrowSaga.handleFailure(
      correlationId,
      payload.escrowId as number,
      payload.reason as string
    );
  });

  /**
   * 6. Refund Requested -> Execute Refund in Payment Saga
   */
  eventBus.subscribe("payment.refund.requested", async (data) => {
    const { payload, correlationId } = data;
    Logger.info(`[Subscriber] RefundRequested -> Executing Refund [CID:${correlationId}]`);
    
    await paymentSaga.handleRefundRequested(
      correlationId,
      0, // EscrowId not strictly needed for refund but good for logging
      payload.paymentId as string,
      payload.reason as string
    );
  });

  Logger.info("Event Subscribers initialized for closed-loop financial engine.");
}
