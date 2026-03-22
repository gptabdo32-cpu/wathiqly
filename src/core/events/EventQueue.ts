import { Queue, Worker, Job } from 'bullmq';
import { eventBus } from './EventBus';
import IORedis from 'ioredis';
import { Logger } from '../observability/Logger';
import { z } from 'zod';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

/**
 * Event Payload Schema (Rule 12, 18)
 */
const EventPayloadSchema = z.object({
  event: z.string(),
  payload: z.record(z.unknown()), // Rule 13: No any
  correlationId: z.string().uuid(),
  idempotencyKey: z.string(),
});

type EventPayload = z.infer<typeof EventPayloadSchema>;

/**
 * EventQueue (BullMQ Implementation)
 * MISSION: Ensure reliable event delivery with retries and DLQ.
 * RULE 4: Implement message queue
 * RULE 6: Add retry mechanism with exponential backoff
 * RULE 7: Implement dead-letter queues
 */
export const eventQueue = new Queue('event-queue', { 
  connection,
  defaultJobOptions: {
    attempts: 5, // RULE 6
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: false, // Keep in failed set (DLQ equivalent)
  }
});

/**
 * Worker to process events from the queue and dispatch them to the EventBus
 * RULE 18: Add correlationId across all flows
 * RULE 5: Ensure every event is idempotent
 */
export const eventWorker = new Worker('event-queue', async (job: Job<EventPayload>) => {
  const { event, payload, correlationId, idempotencyKey } = job.data;
  
  Logger.info(`[EventWorker][CID:${correlationId}] Processing event: ${event}`, { 
    jobId: job.id,
    idempotencyKey 
  });
  
  // Rule 12: Strict input validation
  const validated = EventPayloadSchema.parse(job.data);
  
  // Dispatch to existing EventBus handlers
  // Rule 15: Prevent silent failures
  try {
    await eventBus.publish(validated.event, { 
      payload: validated.payload, 
      correlationId: validated.correlationId,
      idempotencyKey: validated.idempotencyKey 
    });
  } catch (error) {
    Logger.error(`[EventWorker][CID:${correlationId}] CRITICAL: Handler failed for ${event}`, error);
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
  Logger.error(`[EventWorker] Job ${job?.id} failed after ${job?.attemptsMade} attempts`, err, {
    correlationId: job?.data?.correlationId,
    idempotencyKey: job?.data?.idempotencyKey
  });
  
  // Rule 7: Implement dead-letter queues
  if (job?.attemptsMade === job?.opts.attempts) {
    Logger.error(`[EventWorker][DLQ] Job ${job.id} moved to DLQ (failed set)`);
  }
});

/**
 * Helper to publish events to the queue
 * RULE 18: Enforce correlationId
 * RULE 5: Enforce idempotencyKey
 */
export async function publishToQueue(params: {
  event: string;
  payload: Record<string, unknown>;
  correlationId: string;
  idempotencyKey: string;
}) {
  const { event, payload, correlationId, idempotencyKey } = params;
  
  // Rule 12: Strict validation before adding to queue
  EventPayloadSchema.parse({ event, payload, correlationId, idempotencyKey });

  await eventQueue.add(event, { 
    event, 
    payload, 
    correlationId, 
    idempotencyKey 
  }, {
    jobId: idempotencyKey // Rule 5: Use idempotencyKey as jobId for BullMQ built-in deduplication
  });
}
