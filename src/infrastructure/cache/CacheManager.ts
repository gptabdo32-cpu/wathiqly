import IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

/**
 * CacheManager
 * Phase 3.9: Caching using Redis.
 * Improves performance for frequently accessed data like user sessions and escrow states.
 */
export class CacheManager {
  private static redis = new IORedis(REDIS_URL);

  static async get<T>(key: string): Promise<T | null> {
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  static async set(key: string, value: any, ttlSeconds: number = 3600): Promise<void> {
    await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  static async del(key: string): Promise<void> {
    await this.redis.del(key);
  }
}
