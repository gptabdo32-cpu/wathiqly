import IORedis from 'ioredis';
import { Logger } from '../observability/Logger';
import { v4 as uuidv4 } from 'uuid';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const redis = new IORedis(REDIS_URL);

/**
 * Distributed Locking System (Improvement 10)
 * MISSION: Prevent concurrent access to critical financial resources.
 * Uses Redis-based locks with TTL and unique identifiers.
 * 
 * Guarantees:
 * - Only one process can hold a lock at a time
 * - Locks auto-expire to prevent deadlocks
 * - Supports lock renewal for long-running operations
 * - Atomic acquire and release operations
 */
export class DistributedLock {
  private readonly lockKey: string;
  private readonly lockValue: string;
  private readonly ttlMs: number;
  private renewalInterval: NodeJS.Timeout | null = null;

  constructor(resource: string, ttlMs: number = 30000) {
    this.lockKey = `lock:${resource}`;
    this.lockValue = uuidv4(); // Unique identifier for this lock holder
    this.ttlMs = ttlMs;
  }

  /**
   * Attempt to acquire the lock.
   * Returns true if lock was acquired, false if already held by another process.
   */
  async acquire(correlationId: string, maxWaitMs: number = 5000): Promise<boolean> {
    const startTime = Date.now();
    const ttlSeconds = Math.ceil(this.ttlMs / 1000);

    while (Date.now() - startTime < maxWaitMs) {
      try {
        // SET NX EX: Set only if not exists, with expiration
        const result = await redis.set(
          this.lockKey,
          this.lockValue,
          'NX',
          'EX',
          ttlSeconds
        );

        if (result === 'OK') {
          Logger.info(
            `[DistributedLock][CID:${correlationId}] Lock acquired: ${this.lockKey}`,
            { lockValue: this.lockValue }
          );

          // Start renewal interval to prevent lock expiration during long operations
          this.startRenewal(correlationId);
          return true;
        }

        // Lock is held by another process, wait and retry
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        Logger.error(
          `[DistributedLock][CID:${correlationId}] Error acquiring lock: ${this.lockKey}`,
          error
        );
        throw error;
      }
    }

    Logger.warn(
      `[DistributedLock][CID:${correlationId}] Failed to acquire lock within ${maxWaitMs}ms: ${this.lockKey}`
    );
    return false;
  }

  /**
   * Release the lock.
   * Only releases if the lock is held by this instance (verified by lockValue).
   */
  async release(correlationId: string): Promise<boolean> {
    try {
      // Stop renewal interval
      if (this.renewalInterval) {
        clearInterval(this.renewalInterval);
        this.renewalInterval = null;
      }

      // Lua script to ensure atomic check-and-delete
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;

      const result = await redis.eval(script, 1, this.lockKey, this.lockValue);

      if (result === 1) {
        Logger.info(
          `[DistributedLock][CID:${correlationId}] Lock released: ${this.lockKey}`,
          { lockValue: this.lockValue }
        );
        return true;
      }

      Logger.warn(
        `[DistributedLock][CID:${correlationId}] Lock was not held by this instance: ${this.lockKey}`
      );
      return false;
    } catch (error) {
      Logger.error(
        `[DistributedLock][CID:${correlationId}] Error releasing lock: ${this.lockKey}`,
        error
      );
      throw error;
    }
  }

  /**
   * Renew the lock to extend its TTL.
   * Only renews if the lock is held by this instance.
   */
  private async renew(correlationId: string): Promise<boolean> {
    try {
      const ttlSeconds = Math.ceil(this.ttlMs / 1000);
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("expire", KEYS[1], ARGV[2])
        else
          return 0
        end
      `;

      const result = await redis.eval(script, 1, this.lockKey, this.lockValue, ttlSeconds);

      if (result === 1) {
        Logger.debug(
          `[DistributedLock][CID:${correlationId}] Lock renewed: ${this.lockKey}`
        );
        return true;
      }

      Logger.warn(
        `[DistributedLock][CID:${correlationId}] Failed to renew lock: ${this.lockKey}`
      );
      return false;
    } catch (error) {
      Logger.error(
        `[DistributedLock][CID:${correlationId}] Error renewing lock: ${this.lockKey}`,
        error
      );
      return false;
    }
  }

  /**
   * Start automatic renewal of the lock.
   * Renews every (ttlMs / 2) milliseconds to ensure lock doesn't expire.
   */
  private startRenewal(correlationId: string): void {
    const renewalIntervalMs = Math.max(this.ttlMs / 2, 1000); // Renew at 50% of TTL

    this.renewalInterval = setInterval(async () => {
      await this.renew(correlationId);
    }, renewalIntervalMs);
  }

  /**
   * Execute a critical operation while holding the lock.
   * Automatically acquires and releases the lock.
   */
  static async withLock<T>(
    resource: string,
    correlationId: string,
    operation: () => Promise<T>,
    ttlMs: number = 30000
  ): Promise<T> {
    const lock = new DistributedLock(resource, ttlMs);

    const acquired = await lock.acquire(correlationId);
    if (!acquired) {
      throw new Error(`Failed to acquire lock for resource: ${resource}`);
    }

    try {
      return await operation();
    } finally {
      await lock.release(correlationId);
    }
  }
}

export default DistributedLock;
