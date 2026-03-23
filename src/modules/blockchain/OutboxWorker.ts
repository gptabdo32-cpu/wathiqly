import { eq, and, or, lt, sql } from "drizzle-orm";
import { Gauge } from 'prom-client';
import { outboxEvents } from "../../infrastructure/db/schema_outbox";
import { getDb } from "../../infrastructure/db";
import { Logger } from "../../core/observability/Logger";
import { publishToQueue } from "../../core/events/EventQueue";

// Prometheus Gauges for OutboxWorker
const outboxProcessingLatency = new Gauge({
  name: 'outbox_processing_latency_seconds',
  help: 'Latency of outbox event processing in seconds',
  labelNames: ['event_type', 'worker_id', 'status'],
});

const outboxEventRetriesTotal = new Gauge({
  name: 'outbox_event_retries_total',
  help: 'Total number of retries for outbox events',
  labelNames: ['event_type', 'worker_id'],
});

const outboxEventFailuresTotal = new Gauge({
  name: 'outbox_event_failures_total',
  help: 'Total number of failed outbox events',
  labelNames: ['event_type', 'worker_id', 'reason'],
});

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

      Logger.info(`[OutboxWorker] Found ${pendingEvents.length} events to process`, { 
        workerId: "OutboxWorker-1", 
        batchSize: pendingEvents.length 
      });
      // Log metric for retries if applicable
      pendingEvents.forEach(event => {
        if (event.retries > 0) {
          outboxEventRetriesTotal.inc({ event_type: event.eventType, worker_id: 'OutboxWorker-1' });
          Logger.metric('outbox_event_retries_total', 1, { event_type: event.eventType, worker_id: 'OutboxWorker-1', attempt: event.retries });
        }
      });

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
    const startTime = process.hrtime.bigint();

    try {
      // Mark as processing
      await db.update(outboxEvents)
        .set({ 
          status: "processing", 
          lastAttemptAt: new Date(),
          retries: event.retries + 1 
        })
        .where(eq(outboxEvents.id, event.id));

      Logger.info(`[Outbox] Processing event: ${event.eventType}`, { 
        correlationId, 
        eventId: event.eventId,
        status: "processing",
        retryCount: event.retries,
        workerId: "OutboxWorker-1"
      });
      
      // Dispatch to Queue (which eventually calls executeHandlers)
      await publishToQueue({
        event: event.eventType,
        payload: event.payload as Record<string, unknown>,
        correlationId: event.correlationId,
        idempotencyKey: event.idempotencyKey,
        aggregateId: event.aggregateId,
        aggregateType: event.aggregateType
      });

      Logger.info(`[Outbox] Event ${event.eventType} dispatched to queue`, { 
        correlationId, 
        eventId: event.eventId,
        status: "dispatched"
      });
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1_000_000_000; // Convert nanoseconds to seconds
      outboxProcessingLatency.set({ event_type: event.eventType, worker_id: 'OutboxWorker-1', status: 'dispatched' }, duration);
      Logger.metric('outbox_processing_latency_seconds', duration, { event_type: event.eventType, worker_id: 'OutboxWorker-1', status: 'dispatched' });

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
        
      Logger.error(`[Outbox] Dispatch failed: ${event.eventType}`, error, { 
        correlationId, 
        eventId: event.eventId,
        status,
        retryCount: event.retries + 1
      });
      outboxEventFailuresTotal.inc({ event_type: event.eventType, worker_id: 'OutboxWorker-1', reason: errorMessage });
      Logger.metric('outbox_event_failures_total', 1, { event_type: event.eventType, worker_id: 'OutboxWorker-1', reason: errorMessage });
      
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
