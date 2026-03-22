import { getDb } from "../../infrastructure/db";
import { DatabaseError, TransactionError } from "../errors/errors";
import { MySqlTransaction } from "drizzle-orm/mysql2";
import { Logger } from "../observability/Logger";

export type DbTransaction = MySqlTransaction<any, any>;

export interface TransactionContext {
  tx: DbTransaction;
}

export class TransactionManager {
  static async run<T>(callback: (context: TransactionContext) => Promise<T>): Promise<T> {
    const db = await getDb();
    if (!db) {
      throw new DatabaseError("Database connection not available for transaction");
    }

    try {
      return await db.transaction(async (tx) => {
        const context: TransactionContext = { tx };
        try {
          const result = await callback(context);
          return result;
        } catch (error: unknown) {
          const err = error as { code?: string; message: string };
          if (err.code) throw error;
          
          Logger.error("[TransactionManager] Operation inside transaction failed", error);
          throw new TransactionError("Operation inside transaction failed", error instanceof Error ? error : new Error(String(error)));
        }
      });
    } catch (error: unknown) {
      const err = error as { code?: string; message: string };
      if (err.code) throw error;
      
      Logger.error("[TransactionManager] Transaction execution failed", error);
      throw new TransactionError("Transaction execution failed", error instanceof Error ? error : new Error(String(error)));
    }
  }
}
