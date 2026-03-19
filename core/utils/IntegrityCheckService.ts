import { eq, sql, desc } from "drizzle-orm";
import { getDb } from "../../server/db";
import { ledgerAccounts, ledgerEntries } from "../../drizzle/schema_ledger";

/**
 * IntegrityCheckService
 * Provides methods to verify the integrity and consistency of financial data,
 * particularly for the ledger system.
 */
export class IntegrityCheckService {
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
