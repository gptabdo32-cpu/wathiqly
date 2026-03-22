import { Logger } from "../observability/Logger";
import { z } from "zod";
import { DbTransaction } from "../db/TransactionManager";
import { outboxEvents } from "../../infrastructure/db/schema_outbox";
import { v4 as uuidv4 } from 'uuid';

/**
 * Strict Event Schema (Rule 12, 18)
 * RULE 13: Remove all "any" types
 */
export const IntegrationEventSchema = z.object({
  eventId: z.string().uuid(),
  type: z.string(),
  timestamp: z.string(), // ISO String
  correlationId: z.string().uuid(),
  idempotencyKey: z.string(),
  payload: z.record(z.unknown()), // Rule 13: No any
  metadata: z.record(z.unknown()).optional(),
});

export type IntegrationEvent = z.infer<typeof IntegrationEventSchema>;

// type EventHandler<T = Record<string, unknown>> = (data: T & { correlationId: string; idempotencyKey: string }) => Promise<void>;

type EventHandler<T = Record<string, unknown>> = (data: T & { correlationId: string; idempotencyKey: string }) => Promise<void>;

export class EventBus {
  private static instance: EventBus;
  private handlers: Map<string, EventHandler<Record<string, unknown>>[]> = new Map();

  private constructor() {}

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * Subscribe to a specific event.
   * Used by EventWorker to dispatch events to local handlers.
   */
  public subscribe<T extends Record<string, unknown>>(event: string, handler: EventHandler<T>): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)?.push(handler as EventHandler<Record<string, unknown>>);
    Logger.info(`[EventBus] Subscribed to event: ${event}`);
  }

  /**
   * تنفيذ المعالجات المحلية لحدث معين.
   * يتم استدعاؤها بواسطة EventWorker.
   */
  public async executeHandlers(event: string, data: { 
    payload: Record<string, unknown>; 
    correlationId: string; 
    idempotencyKey: string;
  }): Promise<void> {
    const handlers = this.handlers.get(event);
    const correlationId = data.correlationId;
    
    if (!handlers || handlers.length === 0) {
      Logger.info(`[EventBus][CID:${correlationId}] No local handlers for event: ${event}`);
      return;
    }

    const results = await Promise.allSettled(
      handlers.map(async (handler) => {
        try {
          await handler({ 
            ...data.payload, 
            correlationId: data.correlationId, 
            idempotencyKey: data.idempotencyKey 
          });
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          Logger.error(`[EventBus][CID:${correlationId}] Handler ERROR for ${event}: ${errorMessage}`);
          throw error;
        }
      })
    );

    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length > 0) {
      throw new Error(`EventBus: ${failures.length} handlers failed for event ${event}`);
    }
  }

  /**
   * نشر حدث إلى Outbox لضمان التسليم.
   * يجب أن يتم استدعاء هذه الوظيفة داخل معاملة قاعدة بيانات.
   */
  public async publish(event: string, data: {
    payload: Record<string, unknown>;
    correlationId: string;
    idempotencyKey: string;
    eventId?: string;
    aggregateType?: string;
    aggregateId?: string | number;
  }, tx: DbTransaction): Promise<void> {
    const eventId = data.eventId || uuidv4();
    const timestamp = new Date().toISOString();

    Logger.info(`[EventBus][CID:${data.correlationId}] Publishing event to Outbox: ${event}`, {
        eventId,
        type: event,
        timestamp,
    });

    await tx.insert(outboxEvents).values({
      eventId,
      aggregateType: data.aggregateType || "unknown", // يجب تحديد نوع التجميع المناسب هنا
      aggregateId: String(data.aggregateId || "unknown"),   // يجب تحديد معرف التجميع المناسب هنا
      eventType: event,
      version: 1,
      payload: data.payload,
      correlationId: data.correlationId,
      idempotencyKey: data.idempotencyKey,
      status: "pending",
      createdAt: new Date(),
      retries: 0,
    });

    Logger.info(`[EventBus][CID:${data.correlationId}] Event ${event} added to Outbox successfully.`);
  }
}

export const eventBus = EventBus.getInstance();
