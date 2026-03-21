import { CreateEscrowInput } from "../application/use-cases/CreateEscrow";

export interface IEscrowRepository {
  create(data: {
    buyerId: number;
    sellerId: number;
    buyerLedgerAccountId: number;
    escrowLedgerAccountId: number;
    amount: string;
    status: string;
    description: string;
    blockchainStatus: string;
  }, tx?: any): Promise<number>;

  getById(id: number, tx?: any): Promise<any>;
  
  updateStatus(id: number, status: string, tx?: any): Promise<void>;
  
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
