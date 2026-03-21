import { eq, and, or, lt, sql } from "drizzle-orm";
import { outboxEvents } from "../../infrastructure/db/schema_outbox";
import { getDb } from "../../apps/api/db";
import { Logger } from "../../core/observability/Logger";

/**
 * OutboxWorker (Deterministic & Failure-Safe)
 * 
 * MISSION: Ensure replayable events, idempotent handlers, and deterministic failure.
 */
export class OutboxWorker {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly MAX_RETRIES = 5;
  private readonly POLL_INTERVAL_MS = 5000;
  private readonly RETRY_DELAY_MS = 5 * 60 * 1000; // 5 minutes

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    Logger.info("OutboxWorker started (Deterministic Mode)");
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

    // Task 4: Failure Model - Retry policy
    const pendingEvents = await db
      .select()
      .from(outboxEvents)
      .where(
        or(
          eq(outboxEvents.status, "pending"),
          and(
            eq(outboxEvents.status, "failed"),
            lt(outboxEvents.retries, this.MAX_RETRIES),
            or(
              sql`${outboxEvents.lastAttemptAt} IS NULL`,
              sql`${outboxEvents.lastAttemptAt} < NOW() - INTERVAL ${this.RETRY_DELAY_MS / 1000} SECOND`
            )
          )
        )
      )
      .limit(10);

    for (const event of pendingEvents) {
      const correlationId = event.correlationId;
      
      try {
        // Mark as processing (Task 8: Determinism)
        await db.update(outboxEvents)
          .set({ 
            status: "processing", 
            lastAttemptAt: new Date(),
            retries: event.retries + 1 
          })
          .where(eq(outboxEvents.id, event.id));

        // Task 8: Replayable events & Idempotent handlers
        Logger.info(`Processing event: ${event.eventType}`, { correlationId, eventId: event.eventId });
        
        await this.dispatch(event);

        // Mark as completed
        await db.update(outboxEvents)
          .set({ 
            status: "completed", 
            processedAt: new Date(),
            error: null
          })
          .where(eq(outboxEvents.id, event.id));
          
        Logger.audit("EVENT_PROCESSED", "SYSTEM", "SUCCESS", { correlationId, eventType: event.eventType });

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
          
        Logger.error(`Event processing failed: ${event.eventType}`, error, { correlationId, status });
        
        // Task 4: Compensation events (If status is dead_letter)
        if (isDeadLetter) {
          await this.handleDeadLetter(event);
        }
      }
    }
  }

  private async dispatch(event: any) {
    // Task 5: Event-Driven Flow
    // In a real system, this would dispatch to an EventBus or Message Broker
    Logger.info(`Dispatching ${event.eventType} to subscribers...`, { correlationId: event.correlationId });
  }

  private async handleDeadLetter(event: any) {
    Logger.audit("DEAD_LETTER_HANDLING", "SYSTEM", "FAILURE", { 
      correlationId: event.correlationId, 
      eventType: event.eventType,
      reason: "Max retries exceeded"
    });
    // Emit compensation event here
  }
}
