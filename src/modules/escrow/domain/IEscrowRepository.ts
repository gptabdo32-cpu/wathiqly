import { Escrow } from "./Escrow";

export interface IEscrowRepository {
  create(escrow: Escrow, tx?: any): Promise<number>;

  getById(id: number, tx?: any): Promise<Escrow | null>;
  
  update(escrow: Escrow, tx?: any): Promise<void>;
  
  createDispute(data: {
    escrowId: number;
    initiatorId: number;
    reason: string;
    status: string;
  }, tx?: any): Promise<number>;

  getDisputeById(id: number, tx?: any): Promise<any>;

  updateDispute(id: number, data: any, tx?: any): Promise<void>;
  
  saveOutboxEvent(event: {
    aggregateType: string;
    aggregateId: number;
    eventType: string;
    payload: any;
    status: string;
  }, tx?: any): Promise<void>;
}
