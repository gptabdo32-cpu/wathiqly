import { eq, and, or, lt, sql } from "drizzle-orm";
import { outboxEvents } from "../../infrastructure/db/schema_outbox";
import { getDb } from "../../infrastructure/db";
import { Logger } from "../../core/observability/Logger";
import { publishToQueue } from "../../core/events/EventQueue";

/**
 * OutboxWorker (Deterministic & Failure-Safe)
 * MISSION: Ensure reliable execution of outbox events with safe locking and retries.
 */
export class OutboxWorker {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly MAX_RETRIES = 10; 
  private readonly POLL_INTERVAL_MS = 2000;
  private readonly BATCH_SIZE = 20;

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    Logger.info("OutboxWorker started (Reliable Execution Mode)");
    this.runLoop();
  }

  private async runLoop() {
    while (this.isRunning) {
      try {
        await this.processPendingEvents();
      } catch (error) {
        Logger.error("[OutboxWorker] Loop error", error);
      }
      await new Promise(resolve => setTimeout(resolve, this.POLL_INTERVAL_MS));
    }
  }

  public stop() {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    Logger.info("OutboxWorker stopped");
  }

  /**
   * Calculates exponential backoff delay.
   * Formula: base_delay * 2^retries
   */
  private getRetryDelay(retries: number): number {
    const baseDelay = 1000; // 1 second
    return baseDelay * Math.pow(2, retries);
  }

  private async processPendingEvents() {
    const db = await getDb();
    if (!db) return;

    try {
      // Step 1: Fetch and Lock events safely
      // We use FOR UPDATE SKIP LOCKED to allow multiple workers to scale horizontally without collisions.
      const pendingEvents = await db.transaction(async (tx) => {
        return await tx
          .select()
          .from(outboxEvents)
          .where(
            or(
              eq(outboxEvents.status, "pending"),
              and(
                eq(outboxEvents.status, "failed"),
                lt(outboxEvents.retries, this.MAX_RETRIES),
                // Only retry if the backoff time has passed
                sql`${outboxEvents.lastAttemptAt} IS NULL OR ${outboxEvents.lastAttemptAt} < NOW() - INTERVAL ${this.getRetryDelay(sql`${outboxEvents.retries}` as any) / 1000} SECOND`
              )
            )
          )
          .limit(this.BATCH_SIZE)
          .for("update", { skipLocked: true });
      });

      if (pendingEvents.length === 0) return;

      Logger.info(`[OutboxWorker] Found ${pendingEvents.length} events to process`);

      // Step 2: Process events
      for (const event of pendingEvents) {
        await this.processEvent(event);
      }
    } catch (error: unknown) {
      Logger.error("[OutboxWorker] Error in processPendingEvents", error);
    }
  }

  private async processEvent(event: any) {
    const db = await getDb();
    const correlationId = event.correlationId;

    try {
      // Mark as processing
      await db.update(outboxEvents)
        .set({ 
          status: "processing", 
          lastAttemptAt: new Date(),
          retries: event.retries + 1 
        })
        .where(eq(outboxEvents.id, event.id));

      Logger.info(`[Outbox][CID:${correlationId}] Processing event: ${event.eventType}`, { eventId: event.eventId });
      
      // Dispatch to Queue (which eventually calls executeHandlers)
      await publishToQueue({
        event: event.eventType,
        payload: event.payload as Record<string, unknown>,
        correlationId: event.correlationId,
        idempotencyKey: event.idempotencyKey,
        aggregateId: event.aggregateId,
        aggregateType: event.aggregateType
      });

      // The queue worker will update status to 'completed' upon successful execution.
      // However, for direct outbox-to-queue reliability, we consider the 'dispatch' successful here.
      // In a more robust setup, the queue worker would be the one to mark 'completed'.
      // Given the current architecture in EventQueue.ts, it already updates outboxEvents to 'completed'.
      
      Logger.info(`[Outbox][CID:${correlationId}] Event ${event.eventType} dispatched to queue`);

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown outbox dispatch error";
      const isDeadLetter = event.retries + 1 >= this.MAX_RETRIES;
      const status = isDeadLetter ? "dead_letter" : "failed";
      
      await db.update(outboxEvents)
        .set({ 
          status, 
          error: errorMessage,
          lastAttemptAt: new Date()
        })
        .where(eq(outboxEvents.id, event.id));
        
      Logger.error(`[Outbox][CID:${correlationId}] Dispatch failed: ${event.eventType}`, error, { status });
      
      if (isDeadLetter) {
        await this.handleDeadLetter(event, errorMessage);
      }
    }
  }

  private async handleDeadLetter(event: any, errorMessage: string) {
    Logger.error(
      `[Outbox][DLQ][CID:${event.correlationId}] Event ${event.eventType} (ID: ${event.eventId}) moved to Dead Letter Queue.`,
      { 
        eventId: event.eventId,
        error: errorMessage,
        payload: event.payload
      }
    );
    // Here we could also move to a separate 'dead_letter_events' table if required.
    // For now, status 'dead_letter' in outbox_events is our DLQ.
  }
}
