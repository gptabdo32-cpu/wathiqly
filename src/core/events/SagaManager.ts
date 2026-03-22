import { getDb } from "../../infrastructure/db";
import { sagaStates } from "../../infrastructure/db/schema_saga";
import { eq, and } from "drizzle-orm";
import { Logger } from "../observability/Logger";
import { z } from "zod";

/**
 * Saga Manager (Rule 8, 9)
 * MISSION: Deterministic distributed financial system
 * Handles persistence and state transitions for all Sagas.
 */
export class SagaManager {
  /**
   * Initialize or update saga state in the database
   */
  static async saveState(params: {
    sagaId: string;
    type: string;
    status: "STARTED" | "PROCESSING" | "COMPLETED" | "FAILED" | "COMPENSATING" | "COMPENSATED";
    state: Record<string, unknown>;
    correlationId: string;
  }): Promise<void> {
    const db = await getDb();
    
    Logger.info(`[SagaManager][CID:${params.correlationId}] Saving saga state: ${params.sagaId} (${params.status})`);

    try {
      const existing = await db
        .select()
        .from(sagaStates)
        .where(eq(sagaStates.sagaId, params.sagaId))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(sagaStates)
          .set({
            status: params.status,
            state: params.state,
            updatedAt: new Date(),
          })
          .where(eq(sagaStates.sagaId, params.sagaId));
      } else {
        await db.insert(sagaStates).values({
          sagaId: params.sagaId,
          type: params.type,
          status: params.status,
          state: params.state,
          correlationId: params.correlationId,
        });
      }
    } catch (error) {
      Logger.error(`[SagaManager][CID:${params.correlationId}] Failed to save saga state`, error);
      throw error; // Rule 15: No silent failures
    }
  }

  /**
   * Retrieve current saga state
   */
  static async getState<T = Record<string, unknown>>(sagaId: string): Promise<T | null> {
    const db = await getDb();
    const [row] = await db
      .select()
      .from(sagaStates)
      .where(eq(sagaStates.sagaId, sagaId))
      .limit(1);

    return row ? (row.state as T) : null;
  }
}
