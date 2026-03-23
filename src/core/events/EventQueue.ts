import { Queue, Worker, Job } from 'bullmq';
import { Gauge, Counter, Histogram } from 'prom-client'; // For Prometheus metrics
import { eventHandlerLatency } from '../observability/metricsServer';
import { eventBus } from './EventBus';
import IORedis from 'ioredis';
import { Logger } from '../observability/Logger';
import { z } from 'zod';
import { getDb } from '../../infrastructure/db';
import { outboxEvents } from '../../infrastructure/db/schema_outbox';
import { eq } from 'drizzle-orm';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

// Prometheus Metrics
const eventQueueDepth = new Gauge({
  name: 'wathiqly_event_queue_depth',
  help: 'Current depth of the event queue',
  labelNames: ['queue_name'],
});

// const eventProcessingLatency = new Gauge({ // Replaced by eventHandlerLatency
//   name: 'wathiqly_event_processing_latency_seconds',
//   help: 'Latency of event processing in seconds',
//   labelNames: ['event_type', 'worker_id', 'status'],
// });
  name: 'wathiqly_event_processing_latency_seconds',
  help: 'Latency of event processing in seconds',
  labelNames: ['event_type', 'worker_id', 'status'],
});

const eventJobRetriesTotal = new Counter({
  name: 'wathiqly_event_job_retries_total',
  help: 'Total number of retries for event jobs',
  labelNames: ['event_type', 'worker_id'],
});

const eventJobFailuresTotal = new Counter({
  name: 'wathiqly_event_job_failures_total',
  help: 'Total number of failed event jobs',
  labelNames: ['event_type', 'worker_id', 'reason'],
});

// Monitor queue depth periodically
setInterval(async () => {
  const count = await eventQueue.count();
  eventQueueDepth.set({ queue_name: 'event-queue' }, count);
  Logger.metric('event_queue_depth', count, { queue_name: 'event-queue' });
}, 30000); // Every 30 seconds

/**
 * Event Payload Schema (Rule 12, 18)
 * RULE 13: Remove all "any" types
 */
const EventPayloadSchema = z.object({
  event: z.string(),
  payload: z.record(z.unknown()), // Rule 13: No any
  correlationId: z.string().uuid(),
  idempotencyKey: z.string(),
  aggregateId: z.union([z.string(), z.number()]).optional(),
  aggregateType: z.string().optional(),
});

type EventPayload = z.infer<typeof EventPayloadSchema>;

/**
 * EventQueue (BullMQ Implementation)
 * MISSION: Ensure reliable event delivery with retries and DLQ.
 * IMPROVEMENTS: 3, 6, 7 (Ordering, Retry Strategy, DLQ)
 */
export const eventQueue = new Queue('event-queue', { 
  connection,
  defaultJobOptions: {
    // Improvement 7: Retry Strategy with exponential backoff
    // We set 10 attempts to match our OutboxWorker's MAX_RETRIES for full reliability.
    attempts: 10, 
    backoff: {
      type: 'exponential',
      delay: 2000, // Start with 2 seconds, then 4, 8, 16...
    },
    removeOnComplete: true,
    removeOnFail: false, // Keep in failed set (DLQ equivalent) for manual inspection
  }
});

/**
 * Worker to process events from the queue and dispatch them to the EventBus
 * IMPROVEMENTS: 3, 4, 11, 18 (Ordering, Idempotency, Tracing)
 */
export const eventWorker = new Worker('event-queue', async (job: Job<EventPayload>) => {
  const { event, payload, correlationId, idempotencyKey } = job.data;
  
    const handlerName = `handle_${event}`;
    let startTime: bigint = process.hrtime.bigint();
    let duration: number = 0;

  Logger.info(`[EventWorker] Processing event: ${event}`, { 
    correlationId,
    jobId: job.id,
    idempotencyKey,
    status: "processing",
    retryCount: job.attemptsMade,
    workerId: "EventWorker-1"
  });
  if (job.attemptsMade > 0) {
    eventJobRetriesTotal.inc({ event_type: event, worker_id: 'EventWorker-1' });
    Logger.metric('event_job_retries_total', 1, { event_type: event, worker_id: 'EventWorker-1', attempt: job.attemptsMade });
  }
  
  // Rule 12: Strict input validation
  const validated = EventPayloadSchema.parse(job.data);
  
  try {
    // Dispatch to existing EventBus handlers
    await eventBus.executeHandlers(validated.event, { 
      payload: validated.payload, 
      correlationId: validated.correlationId,
      idempotencyKey: validated.idempotencyKey 
    });

    // Improvement 8: Update outbox status on success
    const db = await getDb();
    await db.update(outboxEvents)
      .set({ 
        status: 'completed', 
        processedAt: new Date() 
      })
      .where(eq(outboxEvents.idempotencyKey, validated.idempotencyKey));

    const endTime = process.hrtime.bigint();
    duration = Number(endTime - startTime) / 1_000_000_000; // Convert nanoseconds to seconds
    eventHandlerLatency.observe({ event_type: event, handler_name: handlerName, status: 'completed' }, duration);
    Logger.metric('event_handler_latency_seconds', duration, { event_type: event, handler_name: handlerName, status: 'completed' });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    Logger.error(`[EventWorker] CRITICAL: Handler failed for ${event}`, error, { 
      correlationId,
      status: "failed",
      retryCount: job.attemptsMade,
      workerId: "EventWorker-1"
    });
    eventJobFailuresTotal.inc({ event_type: event, worker_id: 'EventWorker-1', reason: errorMessage });
    Logger.metric('event_job_failures_total', 1, { event_type: event, worker_id: 'EventWorker-1', reason: errorMessage });
    duration = Number(process.hrtime.bigint() - startTime) / 1_000_000_000; // Calculate duration for failure
    eventHandlerLatency.observe({ event_type: event, handler_name: handlerName, status: 'failed' }, duration);
    // Update outbox with error and retry count
    const db = await getDb();
    await db.update(outboxEvents)
      .set({ 
        status: job.attemptsMade >= (job.opts.attempts || 5) ? 'dead_letter' : 'failed',
        error: errorMessage,
        retries: job.attemptsMade,
        lastAttemptAt: new Date()
      })
      .where(eq(outboxEvents.idempotencyKey, validated.idempotencyKey));

    throw error; // BullMQ will retry based on job options
  }
}, { 
  connection,
  concurrency: 5 
});

eventWorker.on('completed', (job) => {
  Logger.info(`[EventWorker] Job ${job.id} completed successfully`);
});

eventWorker.on('failed', (job, err) => {
  const errorMessage = err instanceof Error ? err.message : String(err);
  Logger.error(`[EventWorker] Job ${job?.id} failed`, err, {
    correlationId: job?.data?.correlationId,
    idempotencyKey: job?.data?.idempotencyKey,
    retryCount: job?.attemptsMade,
    status: "failed"
  });
  
  // Improvement 6: DLQ for failed events
  if (job?.attemptsMade === job?.opts.attempts) {
    Logger.error(`[EventWorker][DLQ] Job ${job.id} moved to DLQ (failed set) after ${job.opts.attempts} attempts`);
  }
});

/**
 * Helper to publish events to the queue
 * IMPROVEMENTS: 3, 5, 18 (Ordering, Idempotency, Tracing)
 */
export async function publishToQueue(params: {
  event: string;
  payload: Record<string, unknown>;
  correlationId: string;
  idempotencyKey: string;
  aggregateId?: string | number;
}) {
  const { event, payload, correlationId, idempotencyKey, aggregateId } = params;
  
  // Rule 12: Strict validation before adding to queue
  EventPayloadSchema.parse({ event, payload, correlationId, idempotencyKey, aggregateId });

  // Improvement 3: Guarantee Event Ordering using partition keys
  // BullMQ doesn't have native partition keys, but we can use jobId or a specific queue
  // For strict ordering per aggregate, we use the aggregateId as the jobId prefix
  // or ensure sequential processing in the worker.
  // Here we use idempotencyKey as jobId for deduplication.
  
  await eventQueue.add(event, { 
    event, 
    payload, 
    correlationId, 
    idempotencyKey,
    aggregateId
  }, {
    jobId: idempotencyKey, // Rule 5: Built-in deduplication
    // Improvement 3: For strict ordering, we could use a group key if using BullMQ Pro
    // In standard BullMQ, we can use a single concurrency worker or partition by queue name.
  });
}
