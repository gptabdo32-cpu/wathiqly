import { getDb } from "../../../apps/api/db";

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
      throw new Error("Database connection not available for transaction");
    }

    try {
      return await db.transaction(async (tx) => {
        return await callback(tx);
      });
    } catch (error) {
      console.error("[TransactionManager] Transaction failed:", error);
      throw error;
    }
  }
}
