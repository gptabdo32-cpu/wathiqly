import { eq, and, or, lt, sql } from "drizzle-orm";
import { outboxEvents } from "../../infrastructure/db/schema_outbox";
import { getDb } from "../../apps/api/db";
import { BlockchainOrchestrator } from "./BlockchainOrchestrator";
import { DrizzleEscrowRepository } from "../escrow/infrastructure/DrizzleEscrowRepository";

/**
 * Enhanced OutboxWorker
 * Implements reliable event processing with:
 * - Exponential backoff (simulated via retry delay)
 * - Dead-letter queue (status: dead_letter)
 * - Idempotency (via idempotencyKey)
 * - Error tracking
 */
export class OutboxWorker {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly MAX_RETRIES = 5;
  private readonly POLL_INTERVAL_MS = 10000; // 10 seconds
  private readonly RETRY_DELAY_MS = 5 * 60 * 1000; // 5 minutes

  private orchestrator: BlockchainOrchestrator;

  constructor() {
    const repo = new DrizzleEscrowRepository();
    this.orchestrator = new BlockchainOrchestrator(repo);
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log("[OutboxWorker] Started polling for pending events...");
    this.intervalId = setInterval(() => this.processPendingEvents(), this.POLL_INTERVAL_MS);
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log("[OutboxWorker] Stopped.");
  }

  private async processPendingEvents() {
    const db = await getDb();
    if (!db) return;

    // Fetch events that are 'pending' or 'failed' but still have retries left and are ready for retry
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
      try {
        // Mark as processing
        await db.update(outboxEvents)
          .set({ 
            status: "processing", 
            lastAttemptAt: new Date(),
            retries: event.retries + 1
          })
          .where(eq(outboxEvents.id, event.id));

        console.log(`[OutboxWorker] Processing event ${event.id} (${event.eventType})...`);

        const result = await this.orchestrator.processOutboxEvent(event);

        if (result.success) {
          await db.update(outboxEvents)
            .set({ 
              status: "completed", 
              processedAt: new Date(),
              error: null 
            })
            .where(eq(outboxEvents.id, event.id));
          console.log(`[OutboxWorker] Event ${event.id} completed successfully.`);
        } else {
          throw new Error(result.error || "Unknown error during processing");
        }
      } catch (error: any) {
        const isDeadLetter = event.retries + 1 >= this.MAX_RETRIES;

        console.error(`[OutboxWorker] Failed to process event ${event.id}:`, error.message);

        await db.update(outboxEvents)
          .set({
            status: isDeadLetter ? "dead_letter" : "failed",
            error: error.message,
            lastAttemptAt: new Date()
          })
          .where(eq(outboxEvents.id, event.id));
        
        if (isDeadLetter) {
          console.error(`[OutboxWorker] Event ${event.id} moved to DEAD LETTER QUEUE.`);
        }
      }
    }
  }
}
