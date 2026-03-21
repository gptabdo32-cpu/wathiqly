import { Queue, Worker, Job } from 'bullmq';
import { eventBus } from './EventBus';
import { EventType } from './EventTypes';
import IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

export const eventQueue = new Queue('event-queue', { 
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: true,
  }
});

/**
 * Worker to process events from the queue and dispatch them to the EventBus
 * Phase 3.4: Professional Event System with retry and async processing
 */
export const eventWorker = new Worker('event-queue', async (job: Job) => {
  const { event, payload } = job.data;
  console.log(`[EventWorker] Processing event: ${event}`, payload);
  
  // Dispatch to existing EventBus handlers
  await eventBus.publish(event, payload);
}, { connection });

eventWorker.on('failed', (job, err) => {
  console.error(`[EventWorker] Job ${job?.id} failed: ${err.message}`);
});

/**
 * Helper to publish events to the queue
 */
export async function publishToQueue(event: EventType | string, payload: any) {
  await eventQueue.add(event, { event, payload });
}
