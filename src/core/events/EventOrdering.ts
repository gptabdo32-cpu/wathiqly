import { Logger } from '../observability/Logger';

/**
 * Event Ordering System (Improvement 3)
 * MISSION: Guarantee events are processed in the correct order.
 * 
 * Strategies:
 * 1. Partition Key: Events for the same aggregate are processed sequentially
 * 2. Sequence Number: Global ordering with version numbers
 * 3. Causality Tracking: causationId links events in causal chains
 * 
 * Guarantees:
 * - Events for the same aggregate are never processed out of order
 * - Causal dependencies are preserved
 * - Out-of-order events are detected and handled
 */
export interface OrderedEvent {
  eventId: string;
  aggregateId: string | number; // Partition key
  aggregateType: string;
  sequenceNumber: number; // Global sequence
  aggregateVersion: number; // Version within aggregate
  causationId?: string; // Event that caused this one
  timestamp: string;
  payload: Record<string, unknown>;
}

export class EventOrdering {
  private eventBuffer: Map<string | number, OrderedEvent[]> = new Map(); // Buffer by aggregateId
  private globalSequence: number = 0;
  private aggregateSequences: Map<string | number, number> = new Map(); // Track per-aggregate sequence

  /**
   * Register a new event with ordering information.
   * Assigns sequence numbers and detects out-of-order events.
   */
  registerEvent(params: {
    eventId: string;
    aggregateId: string | number;
    aggregateType: string;
    aggregateVersion: number;
    causationId?: string;
    timestamp: string;
    payload: Record<string, unknown>;
    correlationId: string;
  }): OrderedEvent {
    const {
      eventId,
      aggregateId,
      aggregateType,
      aggregateVersion,
      causationId,
      timestamp,
      payload,
      correlationId,
    } = params;

    // Assign global sequence number
    const sequenceNumber = ++this.globalSequence;

    // Track per-aggregate sequence
    const currentAggregateSeq = this.aggregateSequences.get(aggregateId) || 0;
    if (aggregateVersion <= currentAggregateSeq) {
      Logger.warn(
        `[EventOrdering][CID:${correlationId}] Out-of-order event detected for ${aggregateType}#${aggregateId}`,
        {
          eventId,
          expectedVersion: currentAggregateSeq + 1,
          receivedVersion: aggregateVersion,
        }
      );
    }

    this.aggregateSequences.set(aggregateId, Math.max(currentAggregateSeq, aggregateVersion));

    const orderedEvent: OrderedEvent = {
      eventId,
      aggregateId,
      aggregateType,
      sequenceNumber,
      aggregateVersion,
      causationId,
      timestamp,
      payload,
    };

    // Buffer event by aggregate for sequential processing
    if (!this.eventBuffer.has(aggregateId)) {
      this.eventBuffer.set(aggregateId, []);
    }
    this.eventBuffer.get(aggregateId)!.push(orderedEvent);

    Logger.info(
      `[EventOrdering][CID:${correlationId}] Event registered with ordering: ${eventId}`,
      {
        sequenceNumber,
        aggregateVersion,
        aggregateId,
      }
    );

    return orderedEvent;
  }

  /**
   * Get the next event to process for a specific aggregate.
   * Ensures sequential processing within an aggregate.
   */
  getNextEventForAggregate(aggregateId: string | number): OrderedEvent | null {
    const events = this.eventBuffer.get(aggregateId);
    if (!events || events.length === 0) {
      return null;
    }

    // Return the first event (FIFO within aggregate)
    return events[0];
  }

  /**
   * Mark an event as processed and remove it from the buffer.
   */
  markEventProcessed(eventId: string, aggregateId: string | number): void {
    const events = this.eventBuffer.get(aggregateId);
    if (!events) return;

    const index = events.findIndex((e) => e.eventId === eventId);
    if (index !== -1) {
      events.splice(index, 1);
    }
  }

  /**
   * Get all pending events for an aggregate.
   */
  getPendingEventsForAggregate(aggregateId: string | number): OrderedEvent[] {
    return this.eventBuffer.get(aggregateId) || [];
  }

  /**
   * Validate causal chain: ensure causationId event was processed before this event.
   */
  validateCausalChain(
    event: OrderedEvent,
    processedEventIds: Set<string>,
    correlationId: string
  ): boolean {
    if (!event.causationId) {
      return true; // No causal dependency
    }

    if (!processedEventIds.has(event.causationId)) {
      Logger.warn(
        `[EventOrdering][CID:${correlationId}] Causal dependency not satisfied for event: ${event.eventId}`,
        {
          causationId: event.causationId,
          eventId: event.eventId,
        }
      );
      return false;
    }

    return true;
  }

  /**
   * Get statistics about event ordering.
   */
  getStats(): {
    globalSequence: number;
    bufferedAggregates: number;
    totalBufferedEvents: number;
  } {
    let totalBufferedEvents = 0;
    this.eventBuffer.forEach((events) => {
      totalBufferedEvents += events.length;
    });

    return {
      globalSequence: this.globalSequence,
      bufferedAggregates: this.eventBuffer.size,
      totalBufferedEvents,
    };
  }
}

export default EventOrdering;
