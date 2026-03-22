import { eq } from "drizzle-orm";
import { IPaymentRepository } from "../domain/IPaymentRepository";
import { Wallet } from "../domain/Wallet";
import { wallets, transactions } from "../../../infrastructure/db/schema";
import { p2pTransfers, walletAuditLogs } from "../../../infrastructure/db/schema_wallet_id";
import { outboxEvents } from "../../../infrastructure/db/schema_outbox";
import { getDb } from "../../../apps/api/db";
import { WalletMapper } from "./WalletMapper";

/**
 * DrizzlePaymentRepository (Rule 17: Enforce module boundaries)
 * MISSION: Transform the system into a true distributed, event-driven financial engine
 * RULE 13: Remove all "any" types
 */
export class DrizzlePaymentRepository implements IPaymentRepository {
  async getWalletByUserId(userId: number, tx?: unknown): Promise<Wallet | null> {
    const db = (tx as any) || (await getDb());
    const [row] = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
    
    if (!row) return null;
    
    return WalletMapper.toDomain(row);
  }

  async updateWalletBalance(wallet: Wallet, tx?: unknown): Promise<void> {
    const db = (tx as any) || (await getDb());
    const props = wallet.getProps();
    await db.update(wallets).set({ balance: props.balance }).where(eq(wallets.id, props.id));
  }

  async createP2PTransfer(data: {
    senderId: number;
    receiverId: number;
    amount: string;
    noteEncrypted?: string | null;
    reference: string;
    status: string;
    ipAddress?: string;
  }, tx?: unknown): Promise<number> {
    const db = (tx as any) || (await getDb());
    const [result] = await db.insert(p2pTransfers).values(data);
    return result.insertId;
  }

  async createTransactionHistory(data: {
    userId: number;
    type: string;
    amount: string;
    status: string;
    description: string;
    reference: string;
  }, tx?: unknown): Promise<void> {
    const db = (tx as any) || (await getDb());
    await db.insert(transactions).values(data);
  }

  async createAuditLog(data: {
    userId: number;
    walletId: number;
    action: string;
    previousBalance: string;
    newBalance: string;
    entityType: string;
    entityId: number;
    correlationId: string;
  }, tx?: unknown): Promise<void> {
    const db = (tx as any) || (await getDb());
    await db.insert(walletAuditLogs).values(data);
  }

  async saveOutboxEvent(event: {
    eventId: string;
    aggregateType: string;
    aggregateId: number;
    eventType: string;
    version: number;
    payload: Record<string, unknown>;
    correlationId: string;
    idempotencyKey: string;
    status: string;
  }, tx?: unknown): Promise<void> {
    const db = (tx as any) || (await getDb());
    await db.insert(outboxEvents).values({
      ...event,
      payload: event.payload as any
    });
  }
}
