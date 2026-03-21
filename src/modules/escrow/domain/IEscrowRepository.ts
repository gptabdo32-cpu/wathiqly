import { Escrow } from "./Escrow";

export interface IEscrowRepository {
  create(escrow: Escrow, tx?: any): Promise<number>;

  getById(id: number, tx?: any): Promise<Escrow | null>;
  
  update(escrow: Escrow, tx?: any): Promise<void>;
  updateEscrowBlockchainStatus(escrowId: number, blockchainStatus: "none" | "pending" | "confirmed" | "failed", lastTxHash: string, tx?: any): Promise<void>;
  updateDisputeBlockchainStatus(disputeId: number, blockchainTxHash: string, tx?: any): Promise<void>;
  
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

  // Saga Instance Methods
  createSagaInstance(instance: any, tx?: any): Promise<void>;
  getSagaInstanceByCorrelationId(correlationId: string, tx?: any): Promise<any>;
  updateSagaStatus(correlationId: string, status: string, error?: string, tx?: any): Promise<void>;
}
