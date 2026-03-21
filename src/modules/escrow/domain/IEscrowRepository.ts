import { Escrow } from "./Escrow";
import { Dispute } from "./Dispute";

export interface IEscrowRepository {
  create(data: Omit<Escrow, 'id'>, tx?: any): Promise<number>;
  getById(id: number, tx?: any): Promise<Escrow | undefined>;
  updateStatus(id: number, status: Escrow['status'], tx?: any): Promise<void>;
  createDispute(data: Omit<Dispute, 'id'>, tx?: any): Promise<number>;
  getDisputeById(id: number, tx?: any): Promise<Dispute | undefined>;
  updateDispute(id: number, data: Partial<Dispute>, tx?: any): Promise<void>;
  saveOutboxEvent(event: {
    aggregateType: string;
    aggregateId: number;
    eventType: string;
    payload: any;
    status: string;
  }, tx?: any): Promise<void>;
}
