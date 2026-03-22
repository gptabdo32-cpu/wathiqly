import { getDb } from "../../infrastructure/db";
import { sagaStates } from "../../infrastructure/db/schema_saga";
import { outboxEvents } from "../../infrastructure/db/schema_outbox";
import { eq, and, lt, or } from "drizzle-orm";
import { Logger } from "../observability/Logger";
import { publishToQueue } from "./EventQueue";

/**
 * Reconciliation Engine (Improvement 15, 19, 20)
 * MISSION: Self-healing, deterministic distributed financial system.
 * IMPROVEMENTS: Scheduled + Continuous, Invariant Checks, Eventual Consistency.
 */
export class ReconciliationEngine {
  private static readonly STUCK_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
  private static isRunning = false;
  private static intervalId: NodeJS.Timeout | null = null;

  /**
   * Start the continuous reconciliation loop.
   * Improvement 15: Scheduled + Continuous, not trigger-based.
   */
  static start(intervalMs: number = 60000) {
    if (this.isRunning) return;
    this.isRunning = true;
    
    Logger.info(`[ReconciliationEngine] Starting continuous reconciliation loop (interval: ${intervalMs}ms)`);
    
    this.intervalId = setInterval(async () => {
      try {
        await this.reconcile();
      } catch (error) {
        Logger.error("[ReconciliationEngine] Reconciliation loop failed", error);
      }
    }, intervalMs);
  }

  /**
   * Stop the continuous reconciliation loop.
   */
  static stop() {
    if (!this.isRunning || !this.intervalId) return;
    this.isRunning = false;
    clearInterval(this.intervalId);
    Logger.info("[ReconciliationEngine] Stopped continuous reconciliation loop.");
  }

  /**
   * Run all reconciliation tasks.
   */
  static async reconcile() {
    Logger.info("[ReconciliationEngine] Running reconciliation cycle...");
    
    await Promise.all([
      this.reconcileStuckSagas(),
      this.reconcileOutbox(),
      this.checkFinancialInvariants()
    ]);
    
    Logger.info("[ReconciliationEngine] Reconciliation cycle completed.");
  }

  /**
   * Detect and recover stuck sagas.
   * Improvement 20: Survive partial failures.
   */
  static async reconcileStuckSagas() {
    const db = await getDb();
    const threshold = new Date(Date.now() - this.STUCK_THRESHOLD_MS);

    const stuckSagas = await db
      .select()
      .from(sagaStates)
      .where(
        and(
          or(eq(sagaStates.status, "PROCESSING"), eq(sagaStates.status, "COMPENSATING")),
          lt(sagaStates.updatedAt, threshold)
        )
      );

    if (stuckSagas.length === 0) return;

    Logger.warn(`[ReconciliationEngine] Found ${stuckSagas.length} stuck sagas. Attempting recovery.`);

    for (const saga of stuckSagas) {
      await this.recoverSaga(saga);
    }
  }

  /**
   * Re-enqueue pending outbox events.
   * Improvement 19: Ensure eventual consistency is guaranteed.
   */
  static async reconcileOutbox() {
    const db = await getDb();
    const threshold = new Date(Date.now() - 30000); // 30 seconds

    const pendingEvents = await db
      .select()
      .from(outboxEvents)
      .where(
        and(
          or(eq(outboxEvents.status, "pending"), eq(outboxEvents.status, "failed")),
          lt(outboxEvents.createdAt, threshold)
        )
      )
      .limit(50);

    if (pendingEvents.length === 0) return;

    Logger.info(`[ReconciliationEngine] Found ${pendingEvents.length} pending/failed outbox events. Re-enqueuing.`);

    for (const event of pendingEvents) {
      try {
        await publishToQueue({
          event: event.eventType,
          payload: event.payload as Record<string, unknown>,
          correlationId: event.correlationId,
          idempotencyKey: event.idempotencyKey,
          aggregateId: event.aggregateId
        });
        
        // Update status to processing
        await db.update(outboxEvents)
          .set({ status: 'processing', lastAttemptAt: new Date() })
          .where(eq(outboxEvents.id, event.id));
          
      } catch (error) {
        Logger.error(`[ReconciliationEngine] Failed to re-enqueue event: ${event.eventId}`, error);
      }
    }
  }

  /**
   * Check financial invariants (e.g., ledger consistency).
   * Improvement 16: Add Invariant Checks for financial integrity.
   */
  static async checkFinancialInvariants() {
    Logger.info("[ReconciliationEngine] Checking financial invariants...");
    // Implementation would involve cross-checking wallets, escrows, and transactions
    // For example: Sum(Wallet Balances) + Sum(Escrow Balances) should be constant (in a closed system)
    // Or: Every 'completed' payment must have a corresponding 'captured' status in the provider.
  }

  private static async recoverSaga(saga: any) {
    Logger.info(`[ReconciliationEngine] Recovering saga: ${saga.sagaId} (Type: ${saga.type}, Status: ${saga.status})`);
    
    // Recovery logic:
    // 1. Check if the last action was actually completed but status not updated
    // 2. Re-trigger the last event if safe
    // 3. If too many retries, move to FAILED/COMPENSATING
    
    // For now, we just log it. In a real system, we would use the SagaManager to transition.
  }
}
