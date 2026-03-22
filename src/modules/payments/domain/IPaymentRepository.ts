import { Wallet } from "./Wallet";

/**
 * IPaymentRepository (Rule 17: Enforce module boundaries)
 * MISSION: Transform the system into a true distributed, event-driven financial engine
 * RULE 13: Remove all "any" types
 * RULE 18: Add correlationId across all flows
 */
export interface IPaymentRepository {
  getWalletByUserId(userId: number, tx?: unknown): Promise<Wallet | null>;
  
  updateWalletBalance(wallet: Wallet, tx?: unknown): Promise<void>;
  
  createP2PTransfer(data: {
    senderId: number;
    receiverId: number;
    amount: string;
    noteEncrypted?: string | null;
    reference: string;
    status: string;
    ipAddress?: string;
  }, tx?: unknown): Promise<number>;

  createTransactionHistory(data: {
    userId: number;
    type: string;
    amount: string;
    status: string;
    description: string;
    reference: string;
  }, tx?: unknown): Promise<void>;

  createAuditLog(data: {
    userId: number;
    walletId: number;
    action: string;
    previousBalance: string;
    newBalance: string;
    entityType: string;
    entityId: number;
    correlationId: string; // Rule 18
  }, tx?: unknown): Promise<void>;

  saveOutboxEvent(event: {
    eventId: string;
    aggregateType: string;
    aggregateId: number;
    eventType: string;
    version: number;
    payload: Record<string, unknown>; // Rule 13
    correlationId: string; // Rule 18
    idempotencyKey: string; // Rule 5
    status: string;
  }, tx?: unknown): Promise<void>;
}
