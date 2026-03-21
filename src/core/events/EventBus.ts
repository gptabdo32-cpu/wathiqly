type EventHandler<T = any> = (data: T) => void | Promise<void>;

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
  public async publish<T>(event: string, data: T): Promise<void> {
    const handlers = this.handlers.get(event);
    if (!handlers || handlers.length === 0) {
      console.log(`[EventBus] No handlers for event: ${event}`);
      return;
    }

    console.log(`[EventBus] Publishing event: ${event}`, data);

    // Execute all handlers asynchronously
    const promises = handlers.map(async (handler) => {
      try {
        await handler(data);
      } catch (error) {
        console.error(`[EventBus] Error in handler for event ${event}:`, error);
      }
    });

    await Promise.all(promises);
  }
}

export const eventBus = EventBus.getInstance();
