import { getDb } from "../../infrastructure/db";
import { sagaStates } from "../../infrastructure/db/schema_saga";
import { eq, and } from "drizzle-orm";
import { Logger } from "../observability/Logger";
import { SagaStatus, SagaType, SagaStateSchemas } from "./SagaTypes";

/**
 * Saga Manager (Rule 8, 9)
 * MISSION: Deterministic distributed financial system
 * Handles persistence and state transitions for all Sagas.
 */
export class SagaManager {
  /**
   * Initialize or update saga state in the database
   */
  /**
   * Initialize or update saga state in the database
   * Improvement 1, 2, 8: Atomic transitions, OCC, and Transaction support
   */
  static async saveState<T extends SagaType>(params: {
    sagaId: string;
    type: T;
    status: SagaStatus;
    state: any;
    correlationId: string;
    tx?: any; // Support for external transactions
  }): Promise<void> {
    const db = params.tx || (await getDb());
    
    Logger.info(`[SagaManager][CID:${params.correlationId}] Saving saga state: ${params.sagaId} (${params.status})`);

    const schema = SagaStateSchemas[params.type];
    if (!schema) {
      throw new Error(`No schema defined for saga type: ${params.type}`);
    }
    const validatedState = schema.parse(params.state);

    try {
      const existing = await db
        .select()
        .from(sagaStates)
        .where(eq(sagaStates.sagaId, params.sagaId))
        .limit(1);

      if (existing.length > 0) {
        const currentVersion = existing[0].version;
        
        // Improvement 2: Optimistic Concurrency Control (OCC)
        const result = await db
          .update(sagaStates)
          .set({
            status: params.status,
            state: validatedState,
            updatedAt: new Date(),
            version: currentVersion + 1,
          })
          .where(
            and(
              eq(sagaStates.sagaId, params.sagaId),
              eq(sagaStates.version, currentVersion)
            )
          );

        // In Drizzle with MySQL, result might not have rowsAffected directly depending on driver
        // But we should check if the update actually happened
        if (result[0]?.affectedRows === 0) {
          throw new Error(`Optimistic concurrency conflict for saga: ${params.sagaId}`);
        }
      } else {
        await db.insert(sagaStates).values({
          sagaId: params.sagaId,
          type: params.type,
          status: params.status,
          state: validatedState,
          correlationId: params.correlationId,
          version: 1,
        });
      }
    } catch (error) {
      Logger.error(`[SagaManager][CID:${params.correlationId}] Failed to save saga state`, error);
      throw error;
    }
  }

  /**
   * Retrieve current saga state
   */
  static async getState<T = any>(sagaId: string): Promise<T | null> {
    const db = await getDb();
    const [row] = await db
      .select()
      .from(sagaStates)
      .where(eq(sagaStates.sagaId, sagaId))
      .limit(1);

    return row ? (row.state as T) : null;
  }
}
