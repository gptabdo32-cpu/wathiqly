import { eventBus } from "./EventBus";
import { EventType } from "./EventTypes";

/**
 * Initialize all system-wide subscribers.
 * This is where the "Smart" logic lives, reacting to events automatically.
 */
export function initializeSubscribers() {
  // 1. Notification Subscriber: Send alerts for financial events
  eventBus.subscribe(EventType.ESCROW_FUNDS_LOCKED, (data) => {
    console.log(`[NotificationService] Sending alert to Seller #${data.sellerId}: Funds of ${data.amount} are locked for Escrow #${data.escrowId}`);
    // Logic to call NotificationService would go here
  });

  eventBus.subscribe(EventType.ESCROW_DISPUTE_OPENED, (data) => {
    console.log(`[AdminAlert] SECURITY ALERT: Dispute opened for Escrow #${data.escrowId} by User #${data.initiatorId}. Reason: ${data.reason}`);
    // Logic to notify admins for manual review
  });

  // 2. Audit Subscriber: Log every ledger transaction for security
  eventBus.subscribe(EventType.LEDGER_TRANSACTION_RECORDED, (data) => {
    console.log(`[AuditLog] Transaction #${data.transactionId} recorded: ${data.description}`);
    // Logic to write to a dedicated security log table
  });

  // 3. Analytics Subscriber: Track volume of transactions
  eventBus.subscribe(EventType.LEDGER_TRANSACTION_RECORDED, (data) => {
    if (data.referenceType === "escrow") {
      console.log(`[Analytics] Escrow activity detected. Updating volume stats...`);
    }
  });

  console.log("[EventBus] All subscribers initialized successfully.");
}
