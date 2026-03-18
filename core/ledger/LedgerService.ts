import { eq, sql } from "drizzle-orm";
import { getDb } from "../../server/db";
import { ledgerAccounts, ledgerTransactions, ledgerEntries } from "../../drizzle/schema_ledger";\nimport { eventBus } from "../events/EventBus";\nimport { EventType } from "../events/EventTypes";

export class LedgerService {
  /**
   * Performs a double-entry transaction between two or more accounts.
   * Ensures that total Debits = total Credits.
   */
  static async recordTransaction(params: {
    description: string;
    referenceType?: string;
    referenceId?: number;
    entries: {
      accountId: number;
      debit: string;
      credit: string;
    }[];
  }) {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // 1. Validate Double-Entry: Sum(Debits) must equal Sum(Credits)
    const totalDebit = params.entries.reduce((sum, e) => sum + parseFloat(e.debit), 0);
    const totalCredit = params.entries.reduce((sum, e) => sum + parseFloat(e.credit), 0);

    if (Math.abs(totalDebit - totalCredit) > 0.0001) {
      throw new Error(`Inconsistent Ledger Entry: Total Debit (${totalDebit}) != Total Credit (${totalCredit})`);
    }

    return await db.transaction(async (tx) => {
      // 2. Create the Transaction Header
      const [txHeader] = await tx.insert(ledgerTransactions).values({
        description: params.description,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
      });

      const transactionId = txHeader.insertId;

      // 3. Process each entry and update account balances
      for (const entry of params.entries) {
        // Get current balance with a row lock for consistency
        const [account] = await tx
          .select()
          .from(ledgerAccounts)
          .where(eq(ledgerAccounts.id, entry.accountId))
          .for("update");

        if (!account) throw new Error(`Ledger Account ${entry.accountId} not found`);

        const currentBalance = parseFloat(account.balance);
        const debitAmount = parseFloat(entry.debit);
        const creditAmount = parseFloat(entry.credit);

        // Calculate new balance based on account type
        // Assets/Expenses: Balance = Balance + Debit - Credit
        // Liabilities/Equity/Revenue: Balance = Balance + Credit - Debit
        let newBalance: number;
        if (["asset", "expense"].includes(account.type)) {
          newBalance = currentBalance + debitAmount - creditAmount;
        } else {
          newBalance = currentBalance + creditAmount - debitAmount;
        }

        // 4. Record the Entry (Immutable Record)
        await tx.insert(ledgerEntries).values({
          transactionId,
          accountId: entry.accountId,
          debit: entry.debit,
          credit: entry.credit,
          balanceAfter: newBalance.toFixed(4),
        });

        // 5. Update the Account Balance
        await tx
          .update(ledgerAccounts)
          .set({ balance: newBalance.toFixed(4) })
          .where(eq(ledgerAccounts.id, entry.accountId));
      }

      return transactionId;
    });

    // 6. Publish Event: Transaction Recorded
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
      balance: "0.0000",
    });

    return result.insertId;
  }
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

    const calculatedBalance = account.type === "asset" || account.type === "expense"
      ? parseFloat(sumResult.totalDebit) - parseFloat(sumResult.totalCredit)
      : parseFloat(sumResult.totalCredit) - parseFloat(sumResult.totalDebit);

    return {
      storedBalance: parseFloat(account.balance),
      calculatedBalance,
      isConsistent: Math.abs(parseFloat(account.balance) - calculatedBalance) < 0.0001,
    };
  }
}
