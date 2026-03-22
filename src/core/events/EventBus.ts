import { Logger } from "../observability/Logger";
import { z } from "zod";

/**
 * Strict Event Schema (Rule 12, 18)
 */
export const IntegrationEventSchema = z.object({
  eventId: z.string().uuid(),
  type: z.string(),
  timestamp: z.date(),
  correlationId: z.string().uuid(),
  idempotencyKey: z.string(),
  payload: z.record(z.unknown()), // Rule 13: No any
  metadata: z.record(z.unknown()).optional(),
});

export type IntegrationEvent = z.infer<typeof IntegrationEventSchema>;

type EventHandler<T = Record<string, unknown>> = (data: T & { correlationId: string; idempotencyKey: string }) => Promise<void>;

export class EventBus {
  private static instance: EventBus;
  private handlers: Map<string, EventHandler<any>[]> = new Map();

  private constructor() {}

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * Subscribe to a specific event.
   */
  public subscribe<T extends Record<string, unknown>>(event: string, handler: EventHandler<T>): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)?.push(handler);
    Logger.info(`[EventBus] Subscribed to event: ${event}`);
  }

  /**
   * Publish an event to all local subscribers.
   * Rule 15: Prevent silent failures
   */
  public async publish(event: string, data: { 
    payload: Record<string, unknown>; 
    correlationId: string; 
    idempotencyKey: string;
    eventId?: string;
  }): Promise<void> {
    const handlers = this.handlers.get(event);
    const correlationId = data.correlationId;
    
    if (!handlers || handlers.length === 0) {
      Logger.info(`[EventBus][CID:${correlationId}] No local handlers for event: ${event}`);
      return;
    }

    Logger.info(`[EventBus][CID:${correlationId}] Publishing event: ${event}`, {
        eventId: data.eventId,
        type: event,
        timestamp: new Date().toISOString()
    });

    // Execute all handlers with tracing
    const results = await Promise.allSettled(
      handlers.map(async (handler) => {
        try {
          await handler({ 
            ...data.payload, 
            correlationId: data.correlationId, 
            idempotencyKey: data.idempotencyKey 
          });
          Logger.info(`[EventBus][CID:${correlationId}] Handler SUCCESS for ${event}`);
        } catch (error) {
          Logger.error(`[EventBus][CID:${correlationId}] Handler ERROR for ${event}:`, error);
          throw error; // Re-throw to be caught by Promise.allSettled
        }
      })
    );

    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length > 0) {
      // Rule 15: No silent failures
      throw new Error(`EventBus: ${failures.length} handlers failed for event ${event}`);
    }
  }
}

export const eventBus = EventBus.getInstance();
