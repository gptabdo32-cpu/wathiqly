import { eq, sql, desc } from "drizzle-orm";
import { accountBalancesCache } from "../../drizzle/schema_ledger";
import { getDb } from "../../apps/api/db";
import { ledgerAccounts, ledgerTransactions, ledgerEntries } from "../../drizzle/schema_ledger";
import { idempotencyKeys } from "../../drizzle/schema_idempotency";
import { FraudDetectionService } from "../utils/FraudDetectionService";
import { eventBus } from "../events/EventBus";
import { EventType } from "../events/EventTypes";
import { ILedgerService } from "./domain/ILedgerService";

export class LedgerService implements ILedgerService {
  async getAccountBalance(accountId: number, tx?: any): Promise<number> {
    const db = tx || (await getDb());
    if (!db) throw new Error("Database not available");

    const [cachedBalance] = await db
      .select()
      .from(accountBalancesCache)
      .where(eq(accountBalancesCache.accountId, accountId));

    if (cachedBalance) {
      return parseFloat(cachedBalance.balance);
    }

    const [account] = await db
      .select()
      .from(ledgerAccounts)
      .where(eq(ledgerAccounts.id, accountId));

    if (!account) throw new Error(`Ledger Account ${accountId} not found`);

    const [lastEntry] = await db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.accountId, accountId))
      .orderBy(desc(ledgerEntries.id))
      .limit(1);

    const balance = lastEntry ? parseFloat(lastEntry.balanceAfter) : 0;

    await db.insert(accountBalancesCache)
      .values({ accountId, balance: balance.toFixed(4) })
      .onDuplicateKeyUpdate({ set: { balance: balance.toFixed(4) } });

    return balance;
  }

  async recordTransaction(params: any, tx?: any): Promise<number> {
    const db = tx || (await getDb());
    if (!db) throw new Error("Database not available");

    // 1. Validate Double-Entry
    const totalDebit = params.entries.reduce((sum: any, e: any) => sum + parseFloat(e.debit), 0);
    const totalCredit = params.entries.reduce((sum: any, e: any) => sum + parseFloat(e.credit), 0);

    if (Math.abs(totalDebit - totalCredit) > 0.0001) {
      throw new Error(`Inconsistent Ledger Entry: Total Debit (${totalDebit}) != Total Credit (${totalCredit})`);
    }

    // 2. Logic to run within the provided transaction or create a new one
    const executeLogic = async (innerTx: any) => {
      const [txHeader] = await innerTx.insert(ledgerTransactions).values({
        description: params.description,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
        escrowContractId: params.escrowContractId,
        isSystemTransaction: params.isSystemTransaction ? 1 : 0,
        idempotencyKey: params.idempotencyKey,
      });

      const txId = txHeader.insertId;

      for (const entry of params.entries) {
        const [account] = await innerTx
          .select()
          .from(ledgerAccounts)
          .where(eq(ledgerAccounts.id, entry.accountId))
          .for("update");

        if (!account) throw new Error(`Ledger Account ${entry.accountId} not found`);

        const [lastEntry] = await innerTx
          .select()
          .from(ledgerEntries)
          .where(eq(ledgerEntries.accountId, entry.accountId))
          .orderBy(desc(ledgerEntries.id))
          .limit(1)
          .for("update");

        const currentBalance = lastEntry ? parseFloat(lastEntry.balanceAfter) : 0;
        const debitAmount = parseFloat(entry.debit);
        const creditAmount = parseFloat(entry.credit);

        let newBalance: number;
        if (["asset", "expense"].includes(account.type)) {
          newBalance = currentBalance + debitAmount - creditAmount;
        } else {
          newBalance = currentBalance + creditAmount - debitAmount;
        }

        await innerTx.insert(ledgerEntries).values({
          transactionId: txId,
          accountId: entry.accountId,
          debit: entry.debit,
          credit: entry.credit,
          balanceAfter: newBalance.toFixed(4),
        });

        await innerTx.insert(accountBalancesCache)
          .values({ accountId: entry.accountId, balance: newBalance.toFixed(4) })
          .onDuplicateKeyUpdate({ set: { balance: newBalance.toFixed(4) } });
      }

      return txId;
    };

    // If tx is provided, use it. Otherwise, use db.transaction
    let transactionId: number;
    if (tx) {
      transactionId = await executeLogic(tx);
    } else {
      transactionId = await (db as any).transaction(async (innerTx: any) => {
        return await executeLogic(innerTx);
      });
    }

    return transactionId;
  }

  async createAccount(userId: number, name: string, type: any, tx?: any): Promise<number> {
    const db = tx || (await getDb());
    const [result] = await db.insert(ledgerAccounts).values({
      userId,
      name,
      type,
    });
    return result.insertId;
  }
}
