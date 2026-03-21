import { InvalidPaymentAmountError, InvalidPaymentStateError } from "./errors";

/**
 * Payment Domain Logic
 * Pure functions for fees, rules, and state changes
 */

export type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';
export type PaymentMethod = 'wallet' | 'card' | 'bank_transfer';

export interface Payment {
  id?: string;
  escrowId: string;
  amount: number;
  fee: number;
  totalAmount: number;
  status: PaymentStatus;
  method: PaymentMethod;
  providerReference?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// Business Rules: Fees calculation
const SYSTEM_FEE_PERCENTAGE = 0.025; // 2.5%
const MINIMUM_FEE = 5.0; // 5 SAR

export function calculateFee(amount: number): number {
  if (amount <= 0) throw new InvalidPaymentAmountError(amount);
  
  const calculatedFee = amount * SYSTEM_FEE_PERCENTAGE;
  return Math.max(calculatedFee, MINIMUM_FEE);
}

export function createPayment(data: { escrowId: string, amount: number, method: PaymentMethod }): Payment {
  if (data.amount <= 0) throw new InvalidPaymentAmountError(data.amount);

  const fee = calculateFee(data.amount);
  const totalAmount = data.amount + fee;

  return {
    escrowId: data.escrowId,
    amount: data.amount,
    fee: fee,
    totalAmount: totalAmount,
    status: 'pending',
    method: data.method,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function completePayment(payment: Payment, reference: string): Payment {
  if (payment.status !== 'pending' && payment.status !== 'processing') {
    throw new InvalidPaymentStateError(payment.status, 'complete');
  }

  return {
    ...payment,
    status: 'completed',
    providerReference: reference,
    updatedAt: new Date(),
  };
}

export function failPayment(payment: Payment): Payment {
  return {
    ...payment,
    status: 'failed',
    updatedAt: new Date(),
  };
}
