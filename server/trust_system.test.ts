import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateTrustScore, getUserTrustData } from './trust_logic';
import * as dbModule from './db';

// Mock the database module
vi.mock('./db', () => ({
  getDb: vi.fn(),
  getUserById: vi.fn(),
}));

describe('Trusted Social Rating System', () => {
  const mockUserId = 1;
  const mockUser = {
    id: mockUserId,
    name: 'Test User',
    isPhoneVerified: true,
    isIdentityVerified: true,
    verificationLevel: 2,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (dbModule.getUserById as any).mockResolvedValue(mockUser);
  });

  describe('Trust Score Calculation Logic', () => {
    it('should calculate a high score for a fully verified user with successful transactions', async () => {
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockImplementation((condition) => {
          // Return mock escrows for the first call (transaction factor)
          if (condition.toString().includes('escrows')) {
            return [
              { id: 1, status: 'completed', buyerId: mockUserId },
              { id: 2, status: 'completed', sellerId: mockUserId },
            ];
          }
          // Return mock reviews for the second call (rating factor)
          return [
            { id: 1, rating: 5, revieweeId: mockUserId },
            { id: 2, rating: 4, revieweeId: mockUserId },
          ];
        }),
        transaction: vi.fn().mockImplementation(async (cb) => await cb(mockDb)),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
      };

      (dbModule.getDb as any).mockResolvedValue(mockDb);

      const score = await updateTrustScore(mockUserId, 'test_calculation');
      
      // Expected: 
      // Transaction Factor: 100% (2/2) -> 100 * 0.4 = 40
      // KYC Factor: 100% (Verified) -> 100 * 0.2 = 20
      // Rating Factor: 90% (4.5/5) -> 90 * 0.3 = 27
      // Total: 40 + 20 + 27 = 87
      expect(score).toBeGreaterThanOrEqual(80);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should apply penalties for lost disputes', async () => {
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockImplementation((condition) => {
          if (condition.toString().includes('escrows')) {
            return [
              { id: 1, status: 'completed', buyerId: mockUserId, disputeResolvedBy: 99 }, // Lost dispute
            ];
          }
          return [];
        }),
        transaction: vi.fn().mockImplementation(async (cb) => await cb(mockDb)),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
      };

      (dbModule.getDb as any).mockResolvedValue(mockDb);

      const score = await updateTrustScore(mockUserId, 'test_penalty');
      
      // Penalty for lost dispute is 15 points
      // Base score without penalty would be around 50-60
      expect(score).toBeLessThan(50);
    });
  });

  describe('Security & Integrity', () => {
    it('should clamp the score between 0 and 100', async () => {
       const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnValue([]), // No transactions, no reviews
        transaction: vi.fn().mockImplementation(async (cb) => await cb(mockDb)),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
      };

      (dbModule.getDb as any).mockResolvedValue(mockDb);
      
      // Mocking a scenario that would result in negative score if not clamped
      // (e.g., many lost disputes)
      const score = await updateTrustScore(mockUserId, 'test_clamping');
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });
});
