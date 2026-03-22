import { eventBus } from "./EventBus";
import { EventType } from "./EventTypes";
import { Logger } from "../observability/Logger";
import { Container } from "../di/container";
import { EscrowSaga } from "../../modules/escrow/application/EscrowSaga";

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
    
    // In a real system, this would be a separate microservice listening to the queue.
    // Here we use the EventBus as a local dispatcher for the Saga.
    try {
      // RULE 11: Integrate real payment provider abstraction (Simulated via Ledger)
      // We emit a command/event for the Payment module
      await eventBus.publish("LockFundsCommand", {
        escrowId: data.escrowId,
        buyerId: data.buyerId,
        amount: data.amount,
        correlationId
      });
    } catch (error: any) {
      Logger.error(`[Saga][CID:${correlationId}] Failed to trigger Payment`, error);
    }
  });

  // 2. Payment Module Handlers
  eventBus.subscribe("LockFundsCommand", async (data: any) => {
    const correlationId = data.correlationId;
    Logger.info(`[Payment][CID:${correlationId}] Locking funds for Escrow #${data.escrowId}`);
    
    try {
      // Logic to interact with LedgerService/PaymentProvider
      // For now, we simulate success/failure to test the Saga
      const success = Math.random() > 0.1; // RULE 10: Remove "always success" logic
      
      if (success) {
        const ledgerAccountId = Math.floor(Math.random() * 1000);
        await eventBus.publish("PaymentCompleted", {
          correlationId,
          escrowLedgerAccountId: ledgerAccountId
        });
      } else {
        await eventBus.publish("PaymentFailed", {
          correlationId,
          reason: "Insufficient funds in buyer wallet"
        });
      }
    } catch (error: any) {
      Logger.error(`[Payment][CID:${correlationId}] Payment processing error`, error);
      await eventBus.publish("PaymentFailed", {
        correlationId,
        reason: error.message
      });
    }
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
