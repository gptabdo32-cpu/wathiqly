/**
 * Escrow Domain Logic
 * Pure functions for business rules and state changes
 */

export type EscrowStatus = 'pending' | 'funded' | 'completed' | 'disputed' | 'cancelled';

export interface Escrow {
  id?: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  status: EscrowStatus;
  description?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export function createEscrow(data: Partial<Escrow>): Escrow {
  if (!data.amount || data.amount <= 0) {
    throw new Error("Invalid amount: Amount must be greater than 0");
  }

  if (!data.buyerId || !data.sellerId) {
    throw new Error("Invalid participants: Buyer and Seller IDs are required");
  }

  if (data.buyerId === data.sellerId) {
    throw new Error("Invalid participants: Buyer and Seller cannot be the same person");
  }

  return {
    buyerId: data.buyerId as string,
    sellerId: data.sellerId as string,
    amount: data.amount as number,
    status: 'pending',
    description: data.description || '',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function fundEscrow(escrow: Escrow): Escrow {
  if (escrow.status !== 'pending') {
    throw new Error(`Invalid state: Cannot fund escrow in ${escrow.status} status`);
  }

  return {
    ...escrow,
    status: 'funded',
    updatedAt: new Date(),
  };
}

export function completeEscrow(escrow: Escrow): Escrow {
  if (escrow.status !== 'funded') {
    throw new Error(`Invalid state: Cannot complete escrow in ${escrow.status} status`);
  }

  return {
    ...escrow,
    status: 'completed',
    updatedAt: new Date(),
  };
}

export function disputeEscrow(escrow: Escrow): Escrow {
  if (escrow.status !== 'funded') {
    throw new Error(`Invalid state: Cannot dispute escrow in ${escrow.status} status`);
  }

  return {
    ...escrow,
    status: 'disputed',
    updatedAt: new Date(),
  };
}
