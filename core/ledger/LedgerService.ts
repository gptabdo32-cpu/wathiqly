import { eq, sql, desc } from "drizzle-orm";
import { getDb } from "../../server/db";
import { ledgerAccounts, ledgerTransactions, ledgerEntries } from "../../drizzle/schema_ledger";
import { eventBus } from "../events/EventBus";
import { EventType } from "../events/EventTypes";

export class LedgerService {
  /**
   * Calculates the current balance of an account from its ledger entries.
   * Single source of truth is now the ledgerEntries table.
   */
  static async getAccountBalance(accountId: number): Promise<number> {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [account] = await db
      .select()
      .from(ledgerAccounts)
      .where(eq(ledgerAccounts.id, accountId));

    if (!account) throw new Error(`Ledger Account ${accountId} not found`);

    // Fetch the latest entry to get the balanceAfter snapshot
    const [lastEntry] = await db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.accountId, accountId))
      .orderBy(desc(ledgerEntries.id))
      .limit(1);

    if (!lastEntry) return 0;

    return parseFloat(lastEntry.balanceAfter);
  }

  /**
   * Performs a double-entry transaction between two or more accounts.
   * Ensures that total Debits = total Credits.
   * IMPROVEMENT: Supports idempotencyKey and escrowContractId.
   */
  static async recordTransaction(params: {
    description: string;
    referenceType?: string;
    referenceId?: number;
    escrowContractId?: number;
    idempotencyKey?: string;
    entries: {
      accountId: number;
      debit: string;
      credit: string;
    }[];
  }) {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Check for idempotency if key provided
    if (params.idempotencyKey) {
      const [existingTx] = await db
        .select()
        .from(ledgerTransactions)
        .where(eq(ledgerTransactions.idempotencyKey, params.idempotencyKey))
        .limit(1);
      
      if (existingTx) {
        return existingTx.id;
      }
    }

    // 1. Validate Double-Entry: Sum(Debits) must equal Sum(Credits)
    const totalDebit = params.entries.reduce((sum, e) => sum + parseFloat(e.debit), 0);
    const totalCredit = params.entries.reduce((sum, e) => sum + parseFloat(e.credit), 0);

    if (Math.abs(totalDebit - totalCredit) > 0.0001) {
      throw new Error(`Inconsistent Ledger Entry: Total Debit (${totalDebit}) != Total Credit (${totalCredit})`);
    }

    const transactionId = await db.transaction(async (tx) => {
      // 2. Create the Transaction Header
      const [txHeader] = await tx.insert(ledgerTransactions).values({
        description: params.description,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
        escrowContractId: params.escrowContractId,
        idempotencyKey: params.idempotencyKey,
      });

      const txId = txHeader.insertId;

      // 3. Process each entry and calculate new balances
      for (const entry of params.entries) {
        // Get account info and the last entry with a row lock for consistency
        const [account] = await tx
          .select()
          .from(ledgerAccounts)
          .where(eq(ledgerAccounts.id, entry.accountId))
          .for("update");

        if (!account) throw new Error(`Ledger Account ${entry.accountId} not found`);

        // Get the latest balance from ledgerEntries (Source of Truth)
        const [lastEntry] = await tx
          .select()
          .from(ledgerEntries)
          .where(eq(ledgerEntries.accountId, entry.accountId))
          .orderBy(desc(ledgerEntries.id))
          .limit(1)
          .for("update");

        const currentBalance = lastEntry ? parseFloat(lastEntry.balanceAfter) : 0;
        const debitAmount = parseFloat(entry.debit);
        const creditAmount = parseFloat(entry.credit);

        // Calculate new balance based on account type
        let newBalance: number;
        if (["asset", "expense"].includes(account.type)) {
          newBalance = currentBalance + debitAmount - creditAmount;
        } else {
          newBalance = currentBalance + creditAmount - debitAmount;
        }

        // 4. Record the Entry (Immutable Record)
        await tx.insert(ledgerEntries).values({
          transactionId: txId,
          accountId: entry.accountId,
          debit: entry.debit,
          credit: entry.credit,
          balanceAfter: newBalance.toFixed(4),
        });
      }

      return txId;
    });

    // 5. Publish Event: Transaction Recorded
    await eventBus.publish(EventType.LEDGER_TRANSACTION_RECORDED, {
      transactionId,
      description: params.description,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
    });

    return transactionId;
  }

  /**
   * Helper to transfer funds between two user wallets via Ledger.
   */
  static async transferFunds(fromAccountId: number, toAccountId: number, amount: string, description: string) {
    return await this.recordTransaction({
      description,
      entries: [
        { accountId: fromAccountId, debit: "0.0000", credit: amount }, // Credit the source (Liability/Wallet decrease)
        { accountId: toAccountId, debit: amount, credit: "0.0000" },   // Debit the destination (Wallet increase)
      ],
    });
  }

  /**
   * Initialize a new ledger account for a user.
   */
  static async createAccount(userId: number, name: string, type: "asset" | "liability" | "revenue" | "expense") {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [result] = await db.insert(ledgerAccounts).values({
      userId,
      name,
      type,
    });

    return result.insertId;
  }

  /**
   * Audit Trail: Verifies the integrity of the ledger.
   * Checks if all transactions are balanced (Debits = Credits).
   */
  static async verifyLedgerIntegrity() {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const result = await db
      .select({
        transactionId: ledgerEntries.transactionId,
        totalDebit: sql`SUM(${ledgerEntries.debit})`,
        totalCredit: sql`SUM(${ledgerEntries.credit})`,
      })
      .from(ledgerEntries)
      .groupBy(ledgerEntries.transactionId)
      .having(sql`ABS(SUM(${ledgerEntries.debit}) - SUM(${ledgerEntries.credit})) > 0.0001`);

    return {
      isValid: result.length === 0,
      corruptedTransactions: result,
    };
  }

  /**
   * Snapshot Balance Check: Ensures account balance matches sum of its entries.
   */
  static async auditAccountBalance(accountId: number) {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [account] = await db.select().from(ledgerAccounts).where(eq(ledgerAccounts.id, accountId));
    if (!account) throw new Error("Account not found");

    const [sumResult] = await db
      .select({
        totalDebit: sql`SUM(${ledgerEntries.debit})`,
        totalCredit: sql`SUM(${ledgerEntries.credit})`,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.accountId, accountId));

    const calculatedBalanceFromSum = account.type === "asset" || account.type === "expense"
      ? (parseFloat(sumResult.totalDebit as string) || 0) - (parseFloat(sumResult.totalCredit as string) || 0)
      : (parseFloat(sumResult.totalCredit as string) || 0) - (parseFloat(sumResult.totalDebit as string) || 0);

    const [lastEntry] = await db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.accountId, accountId))
      .orderBy(desc(ledgerEntries.id))
      .limit(1);

    const snapshotBalance = lastEntry ? parseFloat(lastEntry.balanceAfter) : 0;

    return {
      snapshotBalance,
      calculatedBalanceFromSum,
      isConsistent: Math.abs(snapshotBalance - calculatedBalanceFromSum) < 0.0001,
    };
  }
}
