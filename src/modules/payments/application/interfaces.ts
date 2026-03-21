import { Payment, PaymentStatus } from "../domain/payment";

export interface IPaymentRepo {
  save(payment: Payment, transaction?: any): Promise<Payment>;
  findById(id: string): Promise<Payment | null>;
  updateStatus(id: string, status: PaymentStatus, reference?: string): Promise<void>;
}

export interface IPaymentProvider {
  charge(amount: number, method: string): Promise<{ success: boolean, reference: string, error?: string }>;
  refund(reference: string, amount: number): Promise<{ success: boolean, error?: string }>;
}

export interface IEventBus {
  emit(event: string, payload: any): Promise<void>;
}

export interface ITransactionManager {
  runInTransaction<T>(work: (trx: any) => Promise<T>): Promise<T>;
}
