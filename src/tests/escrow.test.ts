import { describe, it, expect, beforeEach } from 'vitest';
import { createEscrow, getEscrowById, updateEscrowStatus, getUserEscrows } from './db';
import { escrows } from '../drizzle/schema';
import { getDb } from './db';

describe('Escrow Operations', () => {
  beforeEach(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    await db.delete(escrows);
  });

  it('should create a new escrow transaction', async () => {
    const escrowData = {
      buyerId: 1,
      sellerId: 2,
      title: 'Test Escrow',
      description: 'A test escrow transaction',
      amount: '100.00',
      commissionPercentage: '2.5',
      commissionAmount: '2.50',
      paymentMethod: 'sadad',
      status: 'pending',
    };
    const result = await createEscrow(escrowData);
    expect(result).toBeDefined();
    expect(result[0].insertId).toBeGreaterThan(0);

    const createdEscrow = await getEscrowById(result[0].insertId);
    expect(createdEscrow).toMatchObject(escrowData);
  });

  it('should retrieve an escrow by ID', async () => {
    const escrowData = {
      buyerId: 3,
      sellerId: 4,
      title: 'Another Escrow',
      description: 'Another test escrow transaction',
      amount: '200.00',
      commissionPercentage: '3.0',
      commissionAmount: '6.00',
      paymentMethod: 'tadawul',
      status: 'funded',
    };
    const createResult = await createEscrow(escrowData);
    const escrowId = createResult[0].insertId;

    const retrievedEscrow = await getEscrowById(escrowId);
    expect(retrievedEscrow).toBeDefined();
    expect(retrievedEscrow?.id).toBe(escrowId);
    expect(retrievedEscrow).toMatchObject(escrowData);
  });

  it('should update the status of an escrow transaction', async () => {
    const escrowData = {
      buyerId: 5,
      sellerId: 6,
      title: 'Updatable Escrow',
      description: 'Escrow to be updated',
      amount: '50.00',
      commissionPercentage: '2.0',
      commissionAmount: '1.00',
      paymentMethod: 'edfaali',
      status: 'pending',
    };
    const createResult = await createEscrow(escrowData);
    const escrowId = createResult[0].insertId;

    await updateEscrowStatus(escrowId, 'completed');

    const updatedEscrow = await getEscrowById(escrowId);
    expect(updatedEscrow?.status).toBe('completed');
  });

  it('should list user escrows', async () => {
    const buyerId = 7;
    const sellerId = 8;

    await createEscrow({
      buyerId,
      sellerId: 9,
      title: 'Buyer Escrow 1',
      description: 'Buyer transaction',
      amount: '10.00',
      commissionPercentage: '2.5',
      commissionAmount: '0.25',
      paymentMethod: 'sadad',
      status: 'pending',
    });

    await createEscrow({
      buyerId: 10,
      sellerId,
      title: 'Seller Escrow 1',
      description: 'Seller transaction',
      amount: '20.00',
      commissionPercentage: '2.5',
      commissionAmount: '0.50',
      paymentMethod: 'tadawul',
      status: 'funded',
    });

    const userEscrows = await getUserEscrows(buyerId);
    expect(userEscrows.length).toBe(1);
    expect(userEscrows[0].buyerId).toBe(buyerId);

    const sellerEscrows = await getUserEscrows(sellerId);
    expect(sellerEscrows.length).toBe(1);
    expect(sellerEscrows[0].sellerId).toBe(sellerId);
  });
});
