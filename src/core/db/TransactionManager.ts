import { getDb } from "../../../apps/api/db";
import { DatabaseError, TransactionError } from "../errors/errors";

/**
 * TransactionManager
 * Phase 3.5: Ensures all financial operations are Atomic.
 * Provides a unified way to run database transactions across different modules.
 */
export class TransactionManager {
  /**
   * Run a set of operations within a database transaction.
   * @param callback The operations to perform within the transaction.
   */
  static async run<T>(callback: (tx: any) => Promise<T>): Promise<T> {
    const db = await getDb();
    if (!db) {
      throw new DatabaseError("Database connection not available for transaction");
    }

    try {
      return await db.transaction(async (tx) => {
        try {
          return await callback(tx);
        } catch (error: any) {
          // If it's already an AppError, rethrow it to preserve context
          if (error.code) throw error;
          throw new TransactionError("Operation inside transaction failed", error);
        }
      });
    } catch (error: any) {
      if (error.code) throw error;
      console.error("[TransactionManager] Transaction failed:", error);
      throw new TransactionError("Transaction execution failed", error);
    }
  }
}
