import { eq, sql, desc } from "drizzle-orm";
import { getDb } from "../../server/db";
import { ledgerAccounts, ledgerEntries, ledgerTransactions } from "../../drizzle/schema_ledger";
import { escrowContracts } from "../../drizzle/schema_escrow_engine";

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
  static async verifyEscrowLedgerConsistency() {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const inconsistencies: any[] = [];

    const allEscrowContracts = await db.select().from(escrowContracts);

    for (const contract of allEscrowContracts) {
      // Calculate the sum of all ledger entries related to this escrow contract
      const [ledgerSum] = await db
        .select({
          totalDebit: sql`SUM(${ledgerEntries.debit})`,
          totalCredit: sql`SUM(${ledgerEntries.credit})`,
        })
        .from(ledgerEntries)
        .where(eq(ledgerEntries.escrowContractId, contract.id));

      const currentEscrowBalanceInLedger = (parseFloat(ledgerSum.totalDebit as string) || 0) - (parseFloat(ledgerSum.totalCredit as string) || 0);

      // Check 1: Does the ledger balance match the contract amount?
      if (Math.abs(currentEscrowBalanceInLedger - parseFloat(contract.amount)) > 0.0001) {
        inconsistencies.push({
          type: "EscrowLedgerBalanceMismatch",
          escrowId: contract.id,
          contractAmount: contract.amount,
          ledgerCalculatedBalance: currentEscrowBalanceInLedger.toFixed(4),
          message: `Escrow contract amount (${contract.amount}) does not match ledger calculated balance (${currentEscrowBalanceInLedger.toFixed(4)})`,
        });
      }

      // Check 2: Does the escrow status align with the ledger state?
      // This is a simplified check. A more robust check would involve analyzing specific transaction types.
      if (contract.status === "released" || contract.status === "refunded" || contract.status === "cancelled") {
        // If escrow is in a terminal state, its ledger balance should ideally be zero.
        if (Math.abs(currentEscrowBalanceInLedger) > 0.0001) {
          inconsistencies.push({
            type: "EscrowStatusLedgerMismatch",
            escrowId: contract.id,
            escrowStatus: contract.status,
            ledgerCalculatedBalance: currentEscrowBalanceInLedger.toFixed(4),
            message: `Escrow ${contract.status} but ledger still shows a balance of ${currentEscrowBalanceInLedger.toFixed(4)}`,
          });
        }
      } else if (contract.status === "locked" || contract.status === "disputed") {
        // If escrow is active, its ledger balance should match the contract amount.
        if (Math.abs(currentEscrowBalanceInLedger - parseFloat(contract.amount)) > 0.0001) {
          inconsistencies.push({
            type: "EscrowStatusLedgerMismatch",
            escrowId: contract.id,
            escrowStatus: contract.status,
            ledgerCalculatedBalance: currentEscrowBalanceInLedger.toFixed(4),
            contractAmount: contract.amount,
            message: `Escrow ${contract.status} but ledger balance (${currentEscrowBalanceInLedger.toFixed(4)}) does not match contract amount (${contract.amount})`,
          });
        }
      }
    }

    return {
      isValid: inconsistencies.length === 0,
      inconsistencies,
    };
  }

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
