import { Escrow } from "./Escrow";

export interface OutboxEventInput {
  eventId: string;
  aggregateType: string;
  aggregateId: number;
  eventType: string;
  version: number;
  payload: Record<string, unknown>;
  correlationId: string;
  idempotencyKey: string;
  status: "pending" | "processing" | "completed" | "failed" | "dead_letter";
}

export interface IEscrowRepository {
  create(escrow: Escrow, tx?: unknown): Promise<number>;

  getById(id: number, tx?: unknown): Promise<Escrow | null>;
  
  update(escrow: Escrow, tx?: unknown): Promise<void>;
  
  createDispute(data: {
    escrowId: number;
    initiatorId: number;
    reason: string;
    status: string;
  }, tx?: unknown): Promise<number>;

  getDisputeById(id: number, tx?: unknown): Promise<unknown>;

  updateDispute(id: number, data: Record<string, unknown>, tx?: unknown): Promise<void>;
  
  saveOutboxEvent(event: OutboxEventInput, tx?: unknown): Promise<void>;

  // Saga state is now managed via SagaManager for better modularity (Rule 17)
}
