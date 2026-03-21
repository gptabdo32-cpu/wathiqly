import { eq } from "drizzle-orm";
import { IPaymentRepository } from "../domain/IPaymentRepository";
import { Wallet } from "../domain/Wallet";
import { wallets, transactions } from "../../../drizzle/schema";
import { p2pTransfers, walletAuditLogs } from "../../../drizzle/schema_wallet_id";
import { outboxEvents } from "../../../drizzle/schema_outbox";
import { getDb } from "../../../apps/api/db";
import { WalletMapper } from "./WalletMapper";

export class DrizzlePaymentRepository implements IPaymentRepository {
  async getWalletByUserId(userId: number, tx?: any): Promise<Wallet | null> {
    const db = tx || (await getDb());
    const [row] = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
    
    if (!row) return null;
    
    return WalletMapper.toDomain(row);
  }

  async updateWalletBalance(wallet: Wallet, tx?: any): Promise<void> {
    const db = tx || (await getDb());
    await db.update(wallets).set({ balance: wallet.balance }).where(eq(wallets.id, wallet.id));
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
