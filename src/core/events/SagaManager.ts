import { getDb } from "../../infrastructure/db";
import { sagaStates } from "../../infrastructure/db/schema_saga";
import { eq } from "drizzle-orm";
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
  static async saveState<T extends SagaType>(params: {
    sagaId: string;
    type: T;
    status: SagaStatus;
    state: any; // Validated below
    correlationId: string;
  }): Promise<void> {
    const db = await getDb();
    
    Logger.info(`[SagaManager][CID:${params.correlationId}] Saving saga state: ${params.sagaId} (${params.status})`);

    // Rule 3: Enforce runtime validation of state shape
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
        const result = await db
          .update(sagaStates)
          .set({
            status: params.status,
            state: validatedState,
            updatedAt: new Date(),
            version: currentVersion + 1, // Increment version for optimistic concurrency
          })
          .where(eq(sagaStates.sagaId, params.sagaId).and(eq(sagaStates.version, currentVersion)));

        if (result.rowsAffected === 0) {
          Logger.warn(`[SagaManager][CID:${params.correlationId}] Optimistic concurrency conflict for saga: ${params.sagaId}. Retrying...`);
          // This indicates a concurrent modification. A retry mechanism or error handling should be in place.
          // For now, we'll throw an error to indicate the conflict.
          throw new Error(`Optimistic concurrency conflict for saga: ${params.sagaId}`);
        }
      } else {
        await db.insert(sagaStates).values({
          sagaId: params.sagaId,
          type: params.type,
          status: params.status,
          state: validatedState,
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
