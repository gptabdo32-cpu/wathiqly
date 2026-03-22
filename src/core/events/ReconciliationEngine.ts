import { getDb } from "../../infrastructure/db";
import { sagaStates } from "../../infrastructure/db/schema_saga";
import { outboxEvents } from "../../infrastructure/db/schema_outbox";
import { eq, and, lt, sql } from "drizzle-orm";
import { Logger } from "../observability/Logger";
import { SagaManager } from "./SagaManager";

/**
 * Reconciliation Engine (Rule 8, 20)
 * MISSION: Detect stuck sagas and failed outbox events, then auto-recover.
 */
export class ReconciliationEngine {
  private static readonly STUCK_THRESHOLD_MINUTES = 5;

  /**
   * Scan for stuck Sagas and trigger recovery
   */
  static async reconcileStuckSagas(): Promise<void> {
    const db = await getDb();
    const threshold = new Date(Date.now() - this.STUCK_THRESHOLD_MINUTES * 60000);

    Logger.info(`[Reconciliation] Scanning for sagas stuck in PROCESSING since ${threshold.toISOString()}`);

    const stuckSagas = await db
      .select()
      .from(sagaStates)
      .where(
        and(
          eq(sagaStates.status, "PROCESSING"),
          lt(sagaStates.updatedAt, threshold)
        )
      );

    for (const saga of stuckSagas) {
      Logger.warn(`[Reconciliation] Found stuck saga: ${saga.sagaId}. Triggering recovery.`);
      // Recovery logic: In a real system, this might re-publish the last event or trigger compensation
      await this.recoverSaga(saga);
    }
  }

  /**
   * Scan for failed outbox events and retry
   */
  static async reconcileOutbox(): Promise<void> {
    const db = await getDb();
    
    const pendingEvents = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.status, "pending"))
      .limit(50);

    for (const event of pendingEvents) {
      Logger.info(`[Reconciliation] Retrying outbox event: ${event.eventId}`);
      // In a real system, this would call the EventRelay service
    }
  }

  private static async recoverSaga(saga: any): Promise<void> {
    // Rule 20: Self-healing behavior
    // For now, we just log it. In production, we'd re-trigger the saga step.
    Logger.info(`[Reconciliation] Recovering saga ${saga.sagaId} of type ${saga.type}`);
  }
}
