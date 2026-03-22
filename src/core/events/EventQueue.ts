import { Queue, Worker, Job } from 'bullmq';
import { eventBus } from './EventBus';
import { EventType } from './EventTypes';
import IORedis from 'ioredis';
import { Logger } from '../observability/Logger';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

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
 */
export const eventWorker = new Worker('event-queue', async (job: Job) => {
  const { event, payload, correlationId } = job.data;
  
  Logger.info(`[EventWorker][CID:${correlationId}] Processing event: ${event}`, { eventId: job.id });
  
  // Dispatch to existing EventBus handlers
  await eventBus.publish(event, { ...payload, correlationId });
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
    eventId: job?.id
  });
});

/**
 * Helper to publish events to the queue
 * RULE 18: Enforce correlationId
 */
export async function publishToQueue(event: EventType | string, payload: any, correlationId: string) {
  if (!correlationId) {
    throw new Error("CorrelationId is mandatory for all events (Rule 18)");
  }
  await eventQueue.add(event, { event, payload, correlationId }, {
    jobId: payload.eventId || undefined // Use eventId as jobId for deduplication if provided
  });
}
