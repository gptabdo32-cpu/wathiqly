type EventHandler<T = any> = (data: T) => void | Promise<void>;

export interface IntegrationEvent<T = any> {
  id: string;
  type: string;
  timestamp: Date;
  payload: T;
  metadata?: Record<string, any>;
}

export class EventBus {
  private static instance: EventBus;
  private handlers: Map<string, EventHandler[]> = new Map();

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
  public subscribe<T>(event: string, handler: EventHandler<T>): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)?.push(handler);
    console.log(`[EventBus] Subscribed to event: ${event}`);
  }

  /**
   * Publish an event to all subscribers.
   */
  /**
   * Publish an event with full observability (Task 9)
   */
  public async publish<T extends { correlationId?: string; eventId?: string }>(event: string, data: T): Promise<void> {
    const handlers = this.handlers.get(event);
    const correlationId = data.correlationId || "unknown";
    
    if (!handlers || handlers.length === 0) {
      console.log(`[EventBus][CID:${correlationId}] No local handlers for event: ${event}`);
      return;
    }

    console.log(`[EventBus][CID:${correlationId}] Publishing event: ${event}`, {
        eventId: data.eventId,
        type: event,
        timestamp: new Date().toISOString()
    });

    // Execute all handlers with tracing
    for (const handler of handlers) {
      try {
        await handler(data);
        console.log(`[EventBus][CID:${correlationId}] Handler SUCCESS for ${event}`);
      } catch (error) {
        console.error(`[EventBus][CID:${correlationId}] Handler ERROR for ${event}:`, error);
        // In a real system, we'd log this to an audit trail table here
      }
    }
  }
}

export const eventBus = EventBus.getInstance();
