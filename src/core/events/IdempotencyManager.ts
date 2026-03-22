import { getDb } from '../../infrastructure/db';
import { Logger } from '../observability/Logger';
import { eq } from 'drizzle-orm';

/**
 * Idempotency Manager (Improvements 4, 11)
 * MISSION: Guarantee that duplicate events are detected and handled safely.
 * 
 * Strategies:
 * 1. Database-level tracking: Store idempotency keys with results
 * 2. Deduplication: Detect and skip duplicate events
 * 3. Atomic operations: Ensure idempotency key and result are stored atomically
 * 
 * Guarantees:
 * - Same event processed twice produces same result
 * - Duplicate detection is reliable and fast
 * - No side effects from duplicate processing
 */

/**
 * Idempotency Record Schema
 */
export interface IdempotencyRecord {
  id?: number;
  idempotencyKey: string;
  eventId: string;
  aggregateId: string | number;
  aggregateType: string;
  eventType: string;
  correlationId: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  result?: Record<string, unknown>; // Serialized result
  error?: string;
  createdAt: Date;
  completedAt?: Date;
  expiresAt: Date; // For cleanup (24 hours default)
}

export class IdempotencyManager {
  private static readonly EXPIRY_HOURS = 24;

  /**
   * Check if an event has been processed before.
   * Improvement 4, 11: Strict enforcement of idempotency
   */
  static async checkIdempotency(params: {
    idempotencyKey: string;
    correlationId: string;
    tx?: any;
  }): Promise<{
    isDuplicate: boolean;
    result?: Record<string, unknown>;
    error?: string;
  }> {
    const { idempotencyKey, correlationId, tx } = params;

    try {
      const db = tx || (await getDb());
      
      // Dynamic import to avoid circular dependencies if any
      const { idempotencyRecords } = await import('../../infrastructure/db/schema_outbox');
      
      const records = await db
        .select()
        .from(idempotencyRecords)
        .where(eq(idempotencyRecords.idempotencyKey, idempotencyKey))
        .limit(1);

      const record = records[0];

      if (!record) {
        Logger.debug(
          `[IdempotencyManager][CID:${correlationId}] New event (no previous record): ${idempotencyKey}`
        );
        return { isDuplicate: false };
      }

      // Check if record has expired
      if (new Date() > record.expiresAt) {
        Logger.info(
          `[IdempotencyManager][CID:${correlationId}] Idempotency record expired: ${idempotencyKey}`
        );
        return { isDuplicate: false };
      }

      if (record.status === 'COMPLETED') {
        Logger.info(
          `[IdempotencyManager][CID:${correlationId}] Duplicate event detected (completed): ${idempotencyKey}`,
          { result: record.result }
        );
        return {
          isDuplicate: true,
          result: record.result as Record<string, unknown>,
        };
      }

      if (record.status === 'FAILED') {
        Logger.warn(
          `[IdempotencyManager][CID:${correlationId}] Duplicate event detected (previously failed): ${idempotencyKey}`,
          { error: record.error }
        );
        return {
          isDuplicate: true,
          error: record.error || undefined,
        };
      }

      // Still processing
      Logger.info(
        `[IdempotencyManager][CID:${correlationId}] Event still processing: ${idempotencyKey}`
      );
      return { isDuplicate: true }; 
    } catch (error) {
      Logger.error(
        `[IdempotencyManager][CID:${correlationId}] Error checking idempotency: ${idempotencyKey}`,
        error
      );
      throw error;
    }
  }

  /**
   * Mark an event as being processed.
   * Improvement 4, 11: Atomic marking with transaction support
   */
  static async markProcessing(params: {
    idempotencyKey: string;
    eventId: string;
    aggregateId: string | number;
    aggregateType: string;
    eventType: string;
    correlationId: string;
    tx?: any;
  }): Promise<void> {
    const {
      idempotencyKey,
      eventId,
      aggregateId,
      aggregateType,
      eventType,
      correlationId,
      tx,
    } = params;

    try {
      const db = tx || (await getDb());
      const { idempotencyRecords } = await import('../../infrastructure/db/schema_outbox');
      
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + this.EXPIRY_HOURS);

      await db.insert(idempotencyRecords).values({
        idempotencyKey,
        eventId,
        aggregateId: String(aggregateId),
        aggregateType,
        eventType,
        correlationId,
        status: 'PROCESSING',
        createdAt: new Date(),
        expiresAt,
      });

      Logger.debug(
        `[IdempotencyManager][CID:${correlationId}] Event marked as processing: ${idempotencyKey}`
      );
    } catch (error) {
      Logger.error(
        `[IdempotencyManager][CID:${correlationId}] Error marking event as processing: ${idempotencyKey}`,
        error
      );
      throw error;
    }
  }

  /**
   * Mark an event as successfully completed.
   * Improvement 4, 11: Atomic completion with transaction support
   */
  static async markCompleted(params: {
    idempotencyKey: string;
    result: Record<string, unknown>;
    correlationId: string;
    tx?: any;
  }): Promise<void> {
    const { idempotencyKey, result, correlationId, tx } = params;

    try {
      const db = tx || (await getDb());
      const { idempotencyRecords } = await import('../../infrastructure/db/schema_outbox');
      
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + this.EXPIRY_HOURS);

      await db
        .update(idempotencyRecords)
        .set({
          status: 'COMPLETED',
          result,
          completedAt: new Date(),
          expiresAt,
        })
        .where(eq(idempotencyRecords.idempotencyKey, idempotencyKey));

      Logger.debug(
        `[IdempotencyManager][CID:${correlationId}] Event marked as completed: ${idempotencyKey}`
      );
    } catch (error) {
      Logger.error(
        `[IdempotencyManager][CID:${correlationId}] Error marking event as completed: ${idempotencyKey}`,
        error
      );
      throw error;
    }
  }

  /**
   * Mark an event as failed.
   * Improvement 4, 11: Atomic failure with transaction support
   */
  static async markFailed(params: {
    idempotencyKey: string;
    error: string;
    correlationId: string;
    tx?: any;
  }): Promise<void> {
    const { idempotencyKey, error, correlationId, tx } = params;

    try {
      const db = tx || (await getDb());
      const { idempotencyRecords } = await import('../../infrastructure/db/schema_outbox');
      
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + this.EXPIRY_HOURS);

      await db
        .update(idempotencyRecords)
        .set({
          status: 'FAILED',
          error,
          completedAt: new Date(),
          expiresAt,
        })
        .where(eq(idempotencyRecords.idempotencyKey, idempotencyKey));

      Logger.debug(
        `[IdempotencyManager][CID:${correlationId}] Event marked as failed: ${idempotencyKey}`
      );
    } catch (error) {
      Logger.error(
        `[IdempotencyManager][CID:${correlationId}] Error marking event as failed: ${idempotencyKey}`,
        error
      );
      throw error;
    }
  }
}

export default IdempotencyManager;
