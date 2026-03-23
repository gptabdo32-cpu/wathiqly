import { eq, and, sql } from "drizzle-orm";
import { outboxEvents } from "../../infrastructure/db/schema_outbox";
import { getDb } from "../../infrastructure/db";
import { Logger } from "../observability/Logger";

/**
 * Dead Letter Queue (DLQ) Manager
 * MISSION: Handle events that have failed all retry attempts.
 */
export class DLQManager {
  /**
   * Retrieves all events currently in the Dead Letter Queue.
   */
  public static async getDeadLetterEvents() {
    const db = await getDb();
    return await db.select()
      .from(outboxEvents)
      .where(eq(outboxEvents.status, "dead_letter"))
      .orderBy(sql`${outboxEvents.lastAttemptAt} DESC`);
  }

  /**
   * Re-queues a dead letter event for another retry attempt.
   * Useful for manual intervention after fixing the root cause.
   */
  public static async retryEvent(eventId: string) {
    const db = await getDb();
    Logger.info(`[DLQManager] Manually re-queuing event: ${eventId}`);
    
    await db.update(outboxEvents)
      .set({
        status: "pending",
        retries: 0, // Reset retries to give it a fresh start
        error: null,
        lastAttemptAt: null
      })
      .where(and(
        eq(outboxEvents.eventId, eventId),
        eq(outboxEvents.status, "dead_letter")
      ));
  }

  /**
   * Purges old dead letter events.
   */
  public static async purgeOldEvents(days: number = 30) {
    const db = await getDb();
    Logger.info(`[DLQManager] Purging dead letter events older than ${days} days`);
    
    await db.delete(outboxEvents)
      .where(and(
        eq(outboxEvents.status, "dead_letter"),
        sql`${outboxEvents.createdAt} < NOW() - INTERVAL ${days} DAY`
      ));
  }
}
