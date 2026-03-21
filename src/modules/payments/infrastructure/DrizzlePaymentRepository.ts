import { eq } from "drizzle-orm";
import { IPaymentRepository } from "../domain/IPaymentRepository";
import { wallets, transactions } from "../../../drizzle/schema";
import { p2pTransfers, walletAuditLogs } from "../../../drizzle/schema_wallet_id";
import { outboxEvents } from "../../../drizzle/schema_outbox";
import { getDb } from "../../../apps/api/db";

export class DrizzlePaymentRepository implements IPaymentRepository {
  async getWalletByUserId(userId: number, tx?: any): Promise<any> {
    const db = tx || (await getDb());
    const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
    return wallet;
  }

  async updateWalletBalance(walletId: number, newBalance: string, tx?: any): Promise<void> {
    const db = tx || (await getDb());
    await db.update(wallets).set({ balance: newBalance }).where(eq(wallets.id, walletId));
  }

  async createP2PTransfer(data: any, tx?: any): Promise<number> {
    const db = tx || (await getDb());
    const [transfer] = await db.insert(p2pTransfers).values(data);
    return transfer.insertId;
  }

  async createTransactionHistory(data: any, tx?: any): Promise<void> {
    const db = tx || (await getDb());
    await db.insert(transactions).values(data);
  }

  async createAuditLog(data: any, tx?: any): Promise<void> {
    const db = tx || (await getDb());
    await db.insert(walletAuditLogs).values(data);
  }

  async saveOutboxEvent(event: any, tx?: any): Promise<void> {
    const db = tx || (await getDb());
    await db.insert(outboxEvents).values(event);
  }
}
