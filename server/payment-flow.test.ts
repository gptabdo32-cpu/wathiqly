import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processEscrowCompletion } from './db-enhanced';
import * as dbModule from './db';

// محاكاة وحدة قاعدة البيانات
vi.mock('./db', async () => {
  const actual = await vi.importActual('./db') as any;
  return {
    ...actual,
    getDb: vi.fn(),
  };
});

describe('Payment and Escrow Flow Integration (Mocked)', () => {
  const buyerId = 101;
  const sellerId = 102;
  const escrowId = 1;

  const mockEscrow = {
    id: escrowId,
    buyerId,
    sellerId,
    title: 'Test Transaction',
    amount: "200.00",
    commissionPercentage: "2.5",
    commissionAmount: "5.00",
    status: 'delivered',
  };

  const mockBuyerWallet = { id: 1, userId: buyerId, balance: "500.00" };
  const mockSellerWallet = { id: 2, userId: sellerId, balance: "0.00", totalEarned: "0.00" };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should complete the flow atomically when status is delivered', async () => {
    // إعداد محاكاة المعاملة (Transaction)
    const mockTx = {
      query: {
        escrows: { findFirst: vi.fn().mockResolvedValue(mockEscrow) },
        wallets: { 
          findFirst: vi.fn()
            .mockResolvedValueOnce(mockBuyerWallet)
            .mockResolvedValueOnce(mockSellerWallet)
        },
      },
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue({}),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockResolvedValue({}),
    };

    const mockDb = {
      transaction: vi.fn().mockImplementation(async (cb) => await cb(mockTx)),
    };

    (dbModule.getDb as any).mockResolvedValue(mockDb);

    const result = await processEscrowCompletion(escrowId);

    expect(result.success).toBe(true);
    expect(result.sellerAmount).toBe("195.00"); // 200 - 5

    // التحقق من تحديث محفظة البائع
    expect(mockTx.update).toHaveBeenCalledWith(expect.anything());
    // التحقق من تحديث حالة الوساطة
    expect(mockTx.update).toHaveBeenCalledTimes(2);
    // التحقق من تسجيل المعاملات المالية
    expect(mockTx.insert).toHaveBeenCalledTimes(2);
  });

  it('should throw error if escrow is not delivered', async () => {
    const undeliveredEscrow = { ...mockEscrow, status: 'funded' };
    
    const mockTx = {
      query: {
        escrows: { findFirst: vi.fn().mockResolvedValue(undeliveredEscrow) },
      },
    };

    const mockDb = {
      transaction: vi.fn().mockImplementation(async (cb) => await cb(mockTx)),
    };

    (dbModule.getDb as any).mockResolvedValue(mockDb);

    await expect(processEscrowCompletion(escrowId)).rejects.toThrow("Escrow is not in delivered status");
  });
});
