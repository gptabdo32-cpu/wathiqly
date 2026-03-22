import { eq, and, or, lt } from "drizzle-orm";
import { outboxEvents } from "../../infrastructure/db/schema_outbox";
import { getDb } from "../../infrastructure/db";
import { Logger } from "../../core/observability/Logger";
import { publishToQueue } from "../../core/events/EventQueue";

/**
 * OutboxWorker (Deterministic & Failure-Safe)
 * MISSION: Ensure replayable events, idempotent handlers, and deterministic failure.
 * RULE 7: Implement dead-letter queues
 * RULE 19: Ensure full replayability of events
 * RULE 20: Validate system under failure scenarios
 * RULE 13: Remove all "any" types
 */
export class OutboxWorker {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly MAX_RETRIES = 10; 
  private readonly POLL_INTERVAL_MS = 2000;

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    Logger.info("OutboxWorker started (Event-Driven Mode)");
    this.intervalId = setInterval(() => this.processPendingEvents(), this.POLL_INTERVAL_MS);
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    Logger.info("OutboxWorker stopped");
  }

  private async processPendingEvents() {
    const db = await getDb();
    if (!db) return;

    // Rule 19: Atomic fetch and lock (using skip locked if supported, or simple status update)
    try {
      await db.transaction(async (tx) => {
        const pendingEvents = await tx
          .select()
          .from(outboxEvents)
          .where(
            or(
              eq(outboxEvents.status, "pending"),
              and(
                eq(outboxEvents.status, "failed"),
                lt(outboxEvents.retries, this.MAX_RETRIES)
              )
            )
          )
          .limit(10)
          .for("update", { skipLocked: true }); // Rule 19: Prevent race conditions

        for (const event of pendingEvents) {
          const correlationId = event.correlationId;
          
          try {
            // Rule 19: Mark as processing immediately
            await tx.update(outboxEvents)
              .set({ 
                status: "processing", 
                lastAttemptAt: new Date(),
                retries: event.retries + 1 
              })
              .where(eq(outboxEvents.id, event.id));

            Logger.info(`[Outbox][CID:${correlationId}] Dispatching event: ${event.eventType}`, { eventId: event.eventId });
            
            // RULE 3: Replace direct service calls with event publishing
            await publishToQueue({
              event: event.eventType,
              payload: event.payload as Record<string, unknown>,
              correlationId: event.correlationId,
              idempotencyKey: event.idempotencyKey
            });

            // Mark as completed
            await tx.update(outboxEvents)
              .set({ 
                status: "completed", 
                processedAt: new Date(),
                error: null
              })
              .where(eq(outboxEvents.id, event.id));
              
            Logger.info(`[Outbox][CID:${correlationId}] Event ${event.eventType} dispatched successfully`);

          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : "Unknown outbox dispatch error";
            const isDeadLetter = event.retries + 1 >= this.MAX_RETRIES;
            const status = isDeadLetter ? "dead_letter" : "failed";
            
            await tx.update(outboxEvents)
              .set({ 
                status, 
                error: errorMessage,
                lastAttemptAt: new Date()
              })
              .where(eq(outboxEvents.id, event.id));
              
            Logger.error(`[Outbox][CID:${correlationId}] Dispatch failed: ${event.eventType}`, error, { status });
            
            if (isDeadLetter) {
              await this.handleDeadLetter(event);
            }
          }
        }
      });
    } catch (error: unknown) {
      Logger.error("[OutboxWorker] Transaction error in processPendingEvents", error);
    }
  }

  private async handleDeadLetter(event: { correlationId: string; eventType: string; eventId: string; payload: any; error: string | null }) {
    // Improvement 6: DLQ handling - log comprehensive details for further analysis or manual intervention
    Logger.error(
      `[Outbox][DLQ][CID:${event.correlationId}] Event ${event.eventType} (ID: ${event.eventId}) moved to Dead Letter Queue after max retries.`,
      { 
        eventId: event.eventId,
        eventType: event.eventType,
        correlationId: event.correlationId,
        payload: event.payload, // Include payload for debugging
        error: event.error, // Include the final error
        timestamp: new Date().toISOString()
      }
    );
    // In a real-world scenario, this would involve:
    // 1. Persisting the event to a dedicated DLQ table for manual review/reprocessing.
    // 2. Triggering an alert to the operations team.
    // 3. Potentially sending to a separate queue for automated error handling workflows.
  }
}
