import { getDb } from "../../infrastructure/db";
import { DatabaseError, TransactionError } from "../errors/errors";
import { MySqlTransaction } from "drizzle-orm/mysql2";
import { Logger } from "../observability/Logger";

/**
 * TransactionManager
 * Phase 3.5: Ensures all financial operations are Atomic.
 * Provides a unified way to run database transactions across different modules.
 * RULE 13: Remove all "any" types
 * RULE 15: Prevent silent failures
 * RULE 20: Validate system under failure scenarios
 */
export type DbTransaction = MySqlTransaction<any, any>;

export class TransactionManager {
  /**
   * Run a set of operations within a database transaction.
   * @param callback The operations to perform within the transaction.
   */
  static async run<T>(callback: (tx: DbTransaction) => Promise<T>): Promise<T> {
    const db = await getDb();
    if (!db) {
      throw new DatabaseError("Database connection not available for transaction");
    }

    try {
      return await db.transaction(async (tx) => {
        try {
          return await callback(tx);
        } catch (error: unknown) {
          // If it's already an AppError, rethrow it to preserve context
          const err = error as { code?: string; message: string };
          if (err.code) throw error;
          
          Logger.error("[TransactionManager] Operation inside transaction failed", error);
          throw new TransactionError("Operation inside transaction failed", error instanceof Error ? error : new Error(String(error)));
        }
      });
    } catch (error: unknown) {
      const err = error as { code?: string; message: string };
      if (err.code) throw error;
      
      Logger.error("[TransactionManager] Transaction failed", error);
      throw new TransactionError("Transaction execution failed", error instanceof Error ? error : new Error(String(error)));
    }
  }
}
