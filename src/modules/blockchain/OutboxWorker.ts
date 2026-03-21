import { getDb } from "../../server/db";
import { outboxEvents } from "../../drizzle/schema_outbox";
import { eq, and, lt, or, sql } from "drizzle-orm";
import { BlockchainOrchestrator } from "./BlockchainOrchestrator";
import { eventBus } from "../../core/events/EventBus";

/**
 * OutboxWorker
 * A background worker that polls the outboxEvents table and processes pending events.
 * Implements retry logic for failed events.
 */
export class OutboxWorker {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly MAX_RETRIES = 5;
  private readonly RETRY_DELAY_MS = 5 * 60 * 1000; // 5 minutes

  constructor(private pollIntervalMs: number = 10 * 1000) { // Poll every 10 seconds
    console.log(`[OutboxWorker] Initialized with poll interval: ${this.pollIntervalMs / 1000} seconds`);
  }

  start() {
    if (this.intervalId) {
      console.warn("[OutboxWorker] Worker already running.");
      return;
    }

    console.log("[OutboxWorker] Starting outbox worker...");
    this.intervalId = setInterval(async () => {
      try {
        await this.processPendingEvents();
      } catch (error) {
        console.error("[OutboxWorker] Error during outbox processing cycle:", error);
      }
    }, this.pollIntervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("[OutboxWorker] Outbox worker stopped.");
    }
  }

  private async processPendingEvents() {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Fetch pending or failed events that are ready for retry
    const eventsToProcess = await db.select()
      .from(outboxEvents)
      .where(and(
        or(
          eq(outboxEvents.status, "pending"),
          and(
            eq(outboxEvents.status, "failed"),
            lt(outboxEvents.retries, this.MAX_RETRIES),
            lt(outboxEvents.lastAttemptAt, sql`NOW() - INTERVAL ${this.RETRY_DELAY_MS / 1000} SECOND`)
          )
        )
      ))
      .limit(10); // Process a batch of events

    for (const event of eventsToProcess) {
      try {
        // Mark as processing to prevent other workers from picking it up
        await db.update(outboxEvents).set({ status: "processing", lastAttemptAt: new Date(), retries: event.retries + 1 })
          .where(eq(outboxEvents.id, event.id));

        const result = await BlockchainOrchestrator.processOutboxEvent(event); // Process the event

        if (!result.success) {
          throw new Error(result.error || "Blockchain operation failed");
        }

        // Publish to internal EventBus for UI/Notifications after successful processing
        await eventBus.publish(event.eventType, event.payload);

        // Mark as completed
        await db.update(outboxEvents).set({ status: "completed", processedAt: new Date(), error: null })
          .where(eq(outboxEvents.id, event.id));

      } catch (error: any) {
        console.error(`[OutboxWorker] Failed to process outbox event ${event.id}:`, error);
        // Mark as failed, store error, and increment retry count
        await db.update(outboxEvents).set({
          status: "failed",
          error: error.message,
          processedAt: new Date(),
        }).where(eq(outboxEvents.id, event.id));
      }
    }
  }
}
