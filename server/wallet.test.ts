import { describe, it, expect, beforeEach } from 'vitest';
import { getOrCreateWallet, createTransaction, getWalletByUserId } from './db';
import { wallets, transactions } from '../drizzle/schema';
import { getDb } from './db'; // Assuming a test database connection

describe('Wallet Operations', () => {
  beforeEach(async () => {
    // Clear the database before each test
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    await db.delete(wallets);
        await db.delete(transactions);
  });

  it('should create a new wallet if one does not exist', async () => {
    const userId = 1;
    const wallet = await getOrCreateWallet(userId);
    expect(wallet).toBeDefined();
    expect(wallet.userId).toBe(userId);
    expect(wallet.balance).toBe('0');
  });

  it('should return an existing wallet', async () => {
    const userId = 2;
    await getOrCreateWallet(userId);
    const wallet = await getOrCreateWallet(userId);
    expect(wallet).toBeDefined();
    expect(wallet.userId).toBe(userId);
  });

  it('should create a transaction and update wallet balance', async () => {
    const userId = 3;
    await getOrCreateWallet(userId);

    await createTransaction({
      userId,
      type: 'deposit',
      amount: '100.00',
      status: 'completed',
      description: 'Test deposit',
    });

    const updatedWallet = await getWalletByUserId(userId);
    expect(updatedWallet?.balance).toBe('100.00');
  });

  it('should handle multiple transactions correctly', async () => {
    const userId = 4;
    await getOrCreateWallet(userId);

    await createTransaction({
      userId,
      type: 'deposit',
      amount: '100.00',
      status: 'completed',
      description: 'Initial deposit',
    });

    await createTransaction({
      userId,
      type: 'withdrawal',
      amount: '50.00',
      status: 'completed',
      description: 'Test withdrawal',
    });

    const updatedWallet = await getWalletByUserId(userId);
    expect(updatedWallet?.balance).toBe('50.00');
  });
});
