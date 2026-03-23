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

// 



export class EventBus {
  private static instance: EventBus;


  private constructor() {}

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }



  /**
   * نشر حدث إلى Outbox لضمان التسليم.
   * يجب أن يتم استدعاء هذه الوظيفة داخل معاملة قاعدة بيانات.
   */
  private handlers: Map<string, Array<(data: any) => Promise<void>>> = new Map();

  /**
   * تسجيل معالج لحدث معين.
   */
  public subscribe(event: string, handler: (data: any) => Promise<void>): void {
    const handlers = this.handlers.get(event) || [];
    handlers.push(handler);
    this.handlers.set(event, handlers);
    Logger.info(`[EventBus] Subscribed to event: ${event}`);
  }

  /**
   * تنفيذ المعالجات المسجلة لحدث معين.
   */
  public async executeHandlers(event: string, data: any): Promise<void> {
    const handlers = this.handlers.get(event) || [];
    if (handlers.length === 0) {
      Logger.warn(`[EventBus] No handlers found for event: ${event}`);
      return;
    }

    Logger.info(`[EventBus] Executing ${handlers.length} handlers for event: ${event}`, { 
      correlationId: data.correlationId 
    });

    await Promise.all(handlers.map(handler => handler(data)));
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
      aggregateType: data.aggregateType || "unknown",
      aggregateId: String(data.aggregateId || "unknown"),
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
