import { eq, and, or, lt } from "drizzle-orm";
import { outboxEvents } from "../../infrastructure/db/schema_outbox";
import { getDb } from "../../apps/api/db";
import { Logger } from "../../core/observability/Logger";
import { publishToQueue } from "../../core/events/EventQueue";

/**
 * OutboxWorker (Deterministic & Failure-Safe)
 * MISSION: Ensure replayable events, idempotent handlers, and deterministic failure.
 * RULE 2: Introduce real event-driven communication
 * RULE 18: Add correlationId across all flows
 * RULE 19: Ensure full replayability of events
 */
export class OutboxWorker {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly MAX_RETRIES = 10; // Rule 6
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

    // Rule 6: Retry policy with status check
    const pendingEvents = await db
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
      .limit(20);

    for (const event of pendingEvents) {
      const correlationId = event.correlationId;
      
      try {
        // Mark as processing (Rule 19: Determinism)
        await db.update(outboxEvents)
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
        await db.update(outboxEvents)
          .set({ 
            status: "completed", 
            processedAt: new Date(),
            error: null
          })
          .where(eq(outboxEvents.id, event.id));
          
        Logger.audit("EVENT_DISPATCHED", "SYSTEM", "SUCCESS", { correlationId, eventType: event.eventType });

      } catch (error: any) {
        const isDeadLetter = event.retries + 1 >= this.MAX_RETRIES;
        const status = isDeadLetter ? "dead_letter" : "failed";
        
        await db.update(outboxEvents)
          .set({ 
            status, 
            error: error.message,
            lastAttemptAt: new Date()
          })
          .where(eq(outboxEvents.id, event.id));
          
        Logger.error(`[Outbox][CID:${correlationId}] Dispatch failed: ${event.eventType}`, error, { status });
        
        // RULE 7: Dead-letter queues (Handled by status "dead_letter" in DB)
        if (isDeadLetter) {
          await this.handleDeadLetter(event);
        }
      }
    }
  }

  private async handleDeadLetter(event: any) {
    Logger.audit("DEAD_LETTER_HANDLING", "SYSTEM", "FAILURE", { 
      correlationId: event.correlationId, 
      eventType: event.eventType,
      reason: "Max retries exceeded"
    });
  }
}
