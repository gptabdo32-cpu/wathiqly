import { eq, sql, desc } from "drizzle-orm";
import { accountBalancesCache } from "../../drizzle/schema_ledger";
import { getDb } from "../../server/db";
import { ledgerAccounts, ledgerTransactions, ledgerEntries } from "../../drizzle/schema_ledger";
import { idempotencyKeys } from "../../drizzle/schema_idempotency";
import { FraudDetectionService } from "../utils/FraudDetectionService";
import { eventBus } from "../events/EventBus";
import { EventType } from "../events/EventTypes";
import { ILedgerService } from "./domain/ILedgerService";
	
	export class LedgerService implements ILedgerService {
  /**
   * Calculates the current balance of an account from its ledger entries.
   * Retrieves the current balance of an account, prioritizing the cached balance.
   * If cache is not available or outdated, it will be recalculated from ledgerEntries.
   */
  static async getAccountBalance(accountId: number): Promise<number> {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Try to get from cache first
    const [cachedBalance] = await db
      .select()
      .from(accountBalancesCache)
      .where(eq(accountBalancesCache.accountId, accountId));

    if (cachedBalance) {
      return parseFloat(cachedBalance.balance);
    }

    // If not in cache, calculate from ledgerEntries (this should ideally not happen often)
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

    // Populate cache for future reads
    await db.insert(accountBalancesCache)
      .values({ accountId, balance: balance.toFixed(4) })
      .onDuplicateKeyUpdate({ set: { balance: balance.toFixed(4) } });

    return balance;
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
    isSystemTransaction?: boolean; // New field to indicate system-initiated transactions
    idempotencyKey?: string; // IMPROVEMENT: This should be a composite key, e.g., hash(userId + actionType + payload) to ensure global uniqueness and context-awareness.
    idempotencyActionType?: string; // e.g., "escrow_lock", "escrow_release"
    idempotencyUserId?: number;
    idempotencyPayloadHash?: string;
    entries: {
      accountId: number;
      debit: string;
      credit: string;
    }[];
  }) {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Check for idempotency if key provided using the dedicated idempotencyKeys table
    if (params.idempotencyKey) {
      const [existingIdempotencyRecord] = await db
        .select()
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.idempotencyKey, params.idempotencyKey))
        .limit(1);
      
      if (existingIdempotencyRecord) {
        if (existingIdempotencyRecord.status === "completed") {
          // If already completed, return the stored transactionId
          if (existingIdempotencyRecord.transactionId) {
            return existingIdempotencyRecord.transactionId;
          } else {
            // This should ideally not happen if status is \'completed\'
            throw new Error(`Idempotency key ${params.idempotencyKey} completed but no transactionId found.`);
          }
        } else if (existingIdempotencyRecord.status === "pending") {
          // If still pending, another process is handling it. Throw an error or implement a wait/retry mechanism.
          throw new Error(`Idempotency key ${params.idempotencyKey} is currently being processed.`);
        } else if (existingIdempotencyRecord.status === "failed") {
          // If failed, we might want to retry or throw an error depending on the policy.
          // For now, we\'ll throw an error, but a more sophisticated retry mechanism could be implemented.
          throw new Error(`Idempotency key ${params.idempotencyKey} previously failed.`);
        }
      }
    }

    // 1. Validate Double-Entry: Sum(Debits) must equal Sum(Credits)
    const totalDebit = params.entries.reduce((sum, e) => sum + parseFloat(e.debit), 0);
    const totalCredit = params.entries.reduce((sum, e) => sum + parseFloat(e.credit), 0);

    if (Math.abs(totalDebit - totalCredit) > 0.0001) {
      throw new Error(`Inconsistent Ledger Entry: Total Debit (${totalDebit}) != Total Credit (${totalCredit})`);
    }

    // Basic Fraud Detection
    const isFraudulent = await FraudDetectionService.detectFraud({
      amount: totalDebit.toFixed(4),
      isSystemTransaction: params.isSystemTransaction,
      // Add more fields from params as needed for fraud detection
    });

    if (isFraudulent) {
      throw new Error("Transaction flagged as potentially fraudulent.");
    }

    const transactionId = await db.transaction(async (tx) => {
      // 2. Create the Transaction Header
      const [txHeader] = await tx.insert(ledgerTransactions).values({
        description: params.description,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
        escrowContractId: params.escrowContractId,
        isSystemTransaction: params.isSystemTransaction ? 1 : 0,
        idempotencyKey: params.idempotencyKey,
      });

      // Record the idempotency key in the dedicated table with pending status
      if (params.idempotencyKey) {
        await tx.insert(idempotencyKeys).values({
          idempotencyKey: params.idempotencyKey,
          transactionId: txId,
          status: "pending",
          actionType: params.idempotencyActionType,
          userId: params.idempotencyUserId,
          payloadHash: params.idempotencyPayloadHash,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Example: key expires in 24 hours
        });
      }

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

        // Update the cached balance
        await tx.insert(accountBalancesCache)
          .values({ accountId: entry.accountId, balance: newBalance.toFixed(4) })
          .onDuplicateKeyUpdate({ set: { balance: newBalance.toFixed(4) } });
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
    } catch (error) {
      // If any error occurs during the transaction, mark the idempotency key as failed
      if (params.idempotencyKey) {
        await db.update(idempotencyKeys)
          .set({ status: "failed", responseSnapshot: { error: (error as Error).message }, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) })
          .where(eq(idempotencyKeys.idempotencyKey, params.idempotencyKey));
      }
      throw error; // Re-throw the error after updating idempotency status

    // Update idempotency key status to completed after successful transaction
    if (params.idempotencyKey) {
      await db.update(idempotencyKeys)
        .set({ status: "completed", responseSnapshot: { transactionId }, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) })
        .where(eq(idempotencyKeys.idempotencyKey, params.idempotencyKey));
    }

    return transactionId;
  }

  /**
   * Helper to transfer funds between two user wallets via Ledger.
   */
  static async transferFunds(fromAccountId: number, toAccountId: number, amount: string, description: string, escrowContractId?: number) {
    return await this.recordTransaction({
      description,
      escrowContractId,
      isSystemTransaction: escrowContractId === undefined, // Mark as system transaction if not part of an escrow
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


