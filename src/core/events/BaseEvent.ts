/**
 * Base Event Interface for Deterministic Financial System
 * Enforces traceability, replayability, and idempotency.
 * RULE 13: Remove all "any" types
 * RULE 18: Add correlationId across all flows
 * RULE 19: Ensure full replayability of events
 */
export interface BaseEvent<T = Record<string, unknown>> {
  /** Globally unique event ID (UUID/ULID) */
  eventId: string;
  
  /** The type of event (e.g., 'escrow.funds.locked') */
  eventType: string;
  
  /** The type of aggregate this event belongs to (e.g., 'escrow') */
  aggregateType: string;
  
  /** The ID of the aggregate */
  aggregateId: string | number;
  
  /** Version of the event schema */
  version: number;
  
  /** The actual data of the event */
  payload: T;
  
  /** 
   * Correlation ID: Links all events in a single business flow (e.g., a whole Saga)
   */
  correlationId: string;
  
  /** 
   * Causation ID: The ID of the event or command that caused THIS event
   */
  causationId?: string;
  
  /** Timestamp of when the event occurred (ISO String for better serialization) */
  timestamp: string;
  
  /** Key used to ensure the same operation isn't processed twice */
  idempotencyKey: string;
}

export interface OutboxEvent extends BaseEvent {
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'dead_letter';
  error?: string | null;
  retries: number;
  processedAt?: string | null;
  lastAttemptAt?: string | null;
}
