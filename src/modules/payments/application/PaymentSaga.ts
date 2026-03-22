import { IPaymentProvider } from "../domain/IPaymentProvider";
import { Logger } from "../../../core/observability/Logger";
import { AuditLogger } from "../../../core/audit/AuditLogger";
import { publishToQueue } from "../../../core/events/EventQueue";

/**
 * PaymentSaga (Rule 9: Convert workflows into saga state machines)
 * MISSION: Handle payment lifecycle independently from Escrow module.
 */
export class PaymentSaga {
  constructor(
    private paymentProvider: IPaymentProvider
  ) {}

  /**
   * Handle LockFundsCommand (Rule 2: Event-driven communication)
   */
  async handleLockFunds(data: {
    escrowId: number;
    buyerId: number;
    amount: string;
    correlationId: string;
  }): Promise<void> {
    const { correlationId, escrowId, amount, buyerId } = data;
    
    Logger.info(`[PaymentSaga][CID:${correlationId}] Starting payment authorization for Escrow #${escrowId}`);

    try {
      // Rule 16: Audit logging
      await AuditLogger.log({
        userId: buyerId,
        action: "PAYMENT_AUTHORIZATION_STARTED",
        entityType: "escrow",
        entityId: escrowId,
        correlationId,
        metadata: { amount }
      });

      // Rule 11: Real payment provider abstraction
      const result = await this.paymentProvider.authorize({
        amount,
        currency: "USD", // Default for now
        sourceId: `user_${buyerId}`, // Simplified source mapping
        description: `Escrow payment for #${escrowId}`,
        idempotencyKey: `pay_auth_${escrowId}_${correlationId}` // Rule 5: Idempotency
      });

      if (result.success) {
        Logger.info(`[PaymentSaga][CID:${correlationId}] Payment authorized successfully: ${result.transactionId}`);
        
        // Rule 3: Replace direct service calls with event publishing
        // Rule 4: Implement message queue
        await publishToQueue({
          event: "PaymentCompleted",
          payload: {
            escrowId,
            transactionId: result.transactionId,
            escrowLedgerAccountId: 1001 // Simulated ledger account for now
          },
          correlationId,
          idempotencyKey: `pay_comp_${escrowId}_${correlationId}`
        });

        await AuditLogger.log({
          userId: buyerId,
          action: "PAYMENT_AUTHORIZATION_SUCCESS",
          entityType: "escrow",
          entityId: escrowId,
          correlationId,
          metadata: { transactionId: result.transactionId }
        });
      } else {
        // Rule 10: Remove "always success" logic
        Logger.error(`[PaymentSaga][CID:${correlationId}] Payment authorization failed: ${result.error}`);
        
        await publishToQueue({
          event: "PaymentFailed",
          payload: {
            escrowId,
            reason: result.error || "Payment provider rejected transaction"
          },
          correlationId,
          idempotencyKey: `pay_fail_${escrowId}_${correlationId}`
        });

        await AuditLogger.log({
          userId: buyerId,
          action: "PAYMENT_AUTHORIZATION_FAILED",
          entityType: "escrow",
          entityId: escrowId,
          correlationId,
          metadata: { error: result.error }
        });
      }
    } catch (error: any) {
      // Rule 15: Prevent silent failures
      Logger.error(`[PaymentSaga][CID:${correlationId}] CRITICAL error in payment saga`, error);
      
      await publishToQueue({
        event: "PaymentFailed",
        payload: {
          escrowId,
          reason: "Internal payment processing error"
        },
        correlationId,
        idempotencyKey: `pay_crit_${escrowId}_${correlationId}`
      });
      
      throw error; // Re-throw for BullMQ retry
    }
  }
}
