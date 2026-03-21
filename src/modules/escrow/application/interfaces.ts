import { Escrow } from "../domain/escrow";

export interface IEscrowRepo {
  save(escrow: Escrow): Promise<Escrow>;
  findById(id: string): Promise<Escrow | null>;
  update(id: string, data: Partial<Escrow>): Promise<void>;
}

export interface IPaymentService {
  processPayment(escrowId: string, amount: number): Promise<boolean>;
}

export interface IEventBus {
  emit(event: string, payload: any): Promise<void>;
}
