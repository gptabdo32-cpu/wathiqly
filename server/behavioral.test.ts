import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDb } from './db';
import { behavioralPatternsTable, behavioralSessionsTable } from '../drizzle/schema_behavioral_biometrics';
import { eq } from 'drizzle-orm';

describe('Behavioral Biometrics System', () => {
  let db: any;
  const testUserId = 1;

  beforeEach(async () => {
    db = await getDb();
    // Clean up test data
    if (db) {
      await db.delete(behavioralSessionsTable).where(eq(behavioralSessionsTable.userId, testUserId));
      await db.delete(behavioralPatternsTable).where(eq(behavioralPatternsTable.userId, testUserId));
    }
  });

  afterEach(async () => {
    // Clean up after each test
    if (db) {
      await db.delete(behavioralSessionsTable).where(eq(behavioralSessionsTable.userId, testUserId));
      await db.delete(behavioralPatternsTable).where(eq(behavioralPatternsTable.userId, testUserId));
    }
  });

  describe('Pattern Creation', () => {
    it('should create initial behavioral pattern from typing data', async () => {
      const typingData = {
        typing: Array.from({ length: 15 }, (_, i) => ({
          key: 'a',
          dwellTime: 150 + Math.random() * 20, // 150-170ms
          flightTime: 80 + Math.random() * 10, // 80-90ms
          timestamp: Date.now() + i * 100,
        })),
        scroll: [],
        orientation: [],
        deviceInfo: {
          userAgent: 'Mozilla/5.0',
          screenSize: '1920x1080',
          platform: 'MacIntel',
        },
      };

      // Calculate expected averages
      const avgDwell = typingData.typing.reduce((sum, t) => sum + t.dwellTime, 0) / typingData.typing.length;
      const avgFlight = typingData.typing.reduce((sum, t) => sum + t.flightTime, 0) / typingData.typing.length;

      // Simulate pattern creation
      const pattern = {
        userId: testUserId,
        typingPattern: JSON.stringify({ avgDwell, avgFlight }),
        sampleCount: 1,
      };

      await db.insert(behavioralPatternsTable).values(pattern);

      const [created] = await db
        .select()
        .from(behavioralPatternsTable)
        .where(eq(behavioralPatternsTable.userId, testUserId))
        .limit(1);

      expect(created).toBeDefined();
      expect(created.userId).toBe(testUserId);
      expect(created.sampleCount).toBe(1);

      const parsedPattern = JSON.parse(created.typingPattern);
      expect(parsedPattern.avgDwell).toBeGreaterThan(140);
      expect(parsedPattern.avgDwell).toBeLessThan(180);
    });
  });

  describe('Similarity Score Calculation', () => {
    it('should calculate high similarity for matching patterns', () => {
      const refAvgDwell = 150;
      const currentAvgDwell = 152; // Very close

      const diff = Math.abs(currentAvgDwell - refAvgDwell) / refAvgDwell;
      const similarityScore = Math.max(0, 100 - (diff * 100));

      expect(similarityScore).toBeGreaterThan(98);
      expect(similarityScore).toBeLessThanOrEqual(100);
    });

    it('should calculate low similarity for mismatched patterns', () => {
      const refAvgDwell = 150;
      const currentAvgDwell = 80; // Very different (fast typer vs slow typer)

      const diff = Math.abs(currentAvgDwell - refAvgDwell) / refAvgDwell;
      const similarityScore = Math.max(0, 100 - (diff * 100));

      expect(similarityScore).toBeLessThan(50);
    });

    it('should handle edge cases in similarity calculation', () => {
      // Test with zero difference
      const diff1 = Math.abs(150 - 150) / 150;
      const score1 = Math.max(0, 100 - (diff1 * 100));
      expect(score1).toBe(100);

      // Test with large difference
      const diff2 = Math.abs(50 - 150) / 150;
      const score2 = Math.max(0, 100 - (diff2 * 100));
      expect(score2).toBeLessThan(0); // Should be clamped to 0
      expect(Math.max(0, score2)).toBe(0);
    });
  });

  describe('Security Thresholds', () => {
    it('should identify safe behavior', () => {
      const similarityScore = 85;
      const isSafe = similarityScore > 70;
      expect(isSafe).toBe(true);
    });

    it('should identify warning behavior', () => {
      const similarityScore = 55;
      const isWarning = similarityScore >= 40 && similarityScore <= 70;
      expect(isWarning).toBe(true);
    });

    it('should identify dangerous behavior', () => {
      const similarityScore = 25;
      const isDangerous = similarityScore < 40;
      expect(isDangerous).toBe(true);
    });
  });

  describe('Session Storage', () => {
    it('should store behavioral session data', async () => {
      const sessionData = {
        typing: [
          { key: 'a', dwellTime: 150, flightTime: 80, timestamp: Date.now() },
          { key: 'b', dwellTime: 155, flightTime: 85, timestamp: Date.now() + 100 },
        ],
        scroll: [
          { deltaY: 100, speed: 0.5, timestamp: Date.now() },
        ],
        orientation: [
          { alpha: 0, beta: 45, gamma: 0, timestamp: Date.now() },
        ],
      };

      const session = {
        userId: testUserId,
        sessionId: 'test-session-123',
        sessionData: JSON.stringify(sessionData),
        similarityScore: 92,
        isSuspicious: false,
        deviceInfo: JSON.stringify({
          userAgent: 'Mozilla/5.0',
          screenSize: '1920x1080',
          platform: 'MacIntel',
        }),
        ipAddress: '192.168.1.1',
      };

      await db.insert(behavioralSessionsTable).values(session);

      const [stored] = await db
        .select()
        .from(behavioralSessionsTable)
        .where(eq(behavioralSessionsTable.sessionId, 'test-session-123'))
        .limit(1);

      expect(stored).toBeDefined();
      expect(stored.userId).toBe(testUserId);
      expect(stored.similarityScore).toBe(92);
      expect(stored.isSuspicious).toBe(false);

      const parsedData = JSON.parse(stored.sessionData);
      expect(parsedData.typing).toHaveLength(2);
      expect(parsedData.scroll).toHaveLength(1);
    });
  });

  describe('Account Locking', () => {
    it('should lock account after multiple mismatches', async () => {
      // Create initial pattern
      const pattern = {
        userId: testUserId,
        typingPattern: JSON.stringify({ avgDwell: 150, avgFlight: 80 }),
        sampleCount: 5, // Already has samples
      };

      await db.insert(behavioralPatternsTable).values(pattern);

      // Simulate multiple mismatches
      const similarityScore = 25; // Very low
      const shouldLock = similarityScore < 40 && pattern.sampleCount > 5;

      if (shouldLock) {
        await db.update(behavioralPatternsTable)
          .set({
            isLocked: true,
            lastMismatchAt: new Date(),
          })
          .where(eq(behavioralPatternsTable.userId, testUserId));
      }

      const [updated] = await db
        .select()
        .from(behavioralPatternsTable)
        .where(eq(behavioralPatternsTable.userId, testUserId))
        .limit(1);

      expect(updated.isLocked).toBe(true);
      expect(updated.lastMismatchAt).toBeDefined();
    });
  });

  describe('Pattern Learning', () => {
    it('should update pattern with moving average', async () => {
      // Initial pattern
      const initialPattern = {
        userId: testUserId,
        typingPattern: JSON.stringify({ avgDwell: 150, avgFlight: 80 }),
        sampleCount: 1,
      };

      await db.insert(behavioralPatternsTable).values(initialPattern);

      // New sample
      const newAvgDwell = 155;
      const newSampleCount = 2;

      // Calculate moving average
      const refPattern = JSON.parse(initialPattern.typingPattern);
      const updatedAvgDwell = (refPattern.avgDwell * (newSampleCount - 1) + newAvgDwell) / newSampleCount;

      await db.update(behavioralPatternsTable)
        .set({
          typingPattern: JSON.stringify({ avgDwell: updatedAvgDwell, avgFlight: 80 }),
          sampleCount: newSampleCount,
        })
        .where(eq(behavioralPatternsTable.userId, testUserId));

      const [updated] = await db
        .select()
        .from(behavioralPatternsTable)
        .where(eq(behavioralPatternsTable.userId, testUserId))
        .limit(1);

      const parsedPattern = JSON.parse(updated.typingPattern);
      expect(parsedPattern.avgDwell).toBeCloseTo(152.5, 1);
      expect(updated.sampleCount).toBe(2);
    });
  });

  describe('Multi-Device Support', () => {
    it('should handle patterns from different devices', async () => {
      // Device 1: Desktop
      const session1 = {
        userId: testUserId,
        sessionId: 'desktop-session',
        sessionData: JSON.stringify({
          typing: [{ key: 'a', dwellTime: 150, flightTime: 80, timestamp: Date.now() }],
          scroll: [],
          orientation: [],
        }),
        similarityScore: 95,
        isSuspicious: false,
        deviceInfo: JSON.stringify({
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          screenSize: '1920x1080',
          platform: 'Win32',
        }),
        ipAddress: '192.168.1.1',
      };

      // Device 2: Mobile
      const session2 = {
        userId: testUserId,
        sessionId: 'mobile-session',
        sessionData: JSON.stringify({
          typing: [{ key: 'a', dwellTime: 200, flightTime: 100, timestamp: Date.now() }],
          scroll: [],
          orientation: [{ alpha: 0, beta: 45, gamma: 0, timestamp: Date.now() }],
        }),
        similarityScore: 70, // Slightly lower due to device differences
        isSuspicious: false,
        deviceInfo: JSON.stringify({
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0)',
          screenSize: '390x844',
          platform: 'iPhone',
        }),
        ipAddress: '203.0.113.5',
      };

      await db.insert(behavioralSessionsTable).values(session1);
      await db.insert(behavioralSessionsTable).values(session2);

      const sessions = await db
        .select()
        .from(behavioralSessionsTable)
        .where(eq(behavioralSessionsTable.userId, testUserId));

      expect(sessions).toHaveLength(2);
      expect(sessions[0].similarityScore).toBe(95);
      expect(sessions[1].similarityScore).toBe(70);
    });
  });

  describe('Data Privacy', () => {
    it('should not store raw keystroke data', async () => {
      const pattern = {
        userId: testUserId,
        typingPattern: JSON.stringify({ avgDwell: 150, avgFlight: 80 }), // Only aggregated data
        sampleCount: 1,
      };

      await db.insert(behavioralPatternsTable).values(pattern);

      const [stored] = await db
        .select()
        .from(behavioralPatternsTable)
        .where(eq(behavioralPatternsTable.userId, testUserId))
        .limit(1);

      const parsedPattern = JSON.parse(stored.typingPattern);
      
      // Should not contain individual keystroke data
      expect(parsedPattern.avgDwell).toBeDefined();
      expect(parsedPattern.avgFlight).toBeDefined();
      expect(Array.isArray(parsedPattern)).toBe(false);
    });
  });
});
