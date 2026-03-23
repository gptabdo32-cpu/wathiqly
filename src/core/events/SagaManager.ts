import { getDb } from "../../infrastructure/db";
import { sagaStates } from "../../infrastructure/db/schema_saga";
import { eq, and } from "drizzle-orm";
import { Logger } from "../observability/Logger";
import { Counter } from 'prom-client';
import { SagaStatus, SagaType, SagaStateSchemas } from "./SagaTypes";
import { DbTransaction } from "../db/TransactionManager"; // استيراد DbTransaction

/**
 * Saga Manager (Rule 8, 9)
 * MISSION: Deterministic distributed financial system
 * Handles persistence and state transitions for all Sagas.
 */
export class SagaManager {
  private static sagaStateChanges = new Counter({
    name: 'wathiqly_saga_state_changes_total',
    help: 'Total number of saga state transitions',
    labelNames: ['saga_type', 'from_status', 'to_status'],
  });
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
    tx?: DbTransaction; // إضافة tx اختياريًا
  }): Promise<void> {
    const db = params.tx || (await getDb());
    
    Logger.info(`[SagaManager] Saving saga state: ${params.sagaId}`, { 
      correlationId: params.correlationId, 
      sagaId: params.sagaId, 
      status: params.status 
    });

    let oldStatus: string | undefined;
    if (existing.length > 0) {
      oldStatus = existing[0].status;
    }

    if (oldStatus && oldStatus !== params.status) {
      SagaManager.sagaStateChanges.inc({ saga_type: params.type, from_status: oldStatus, to_status: params.status });
      Logger.metric('saga_state_changes_total', 1, { saga_type: params.type, from_status: oldStatus, to_status: params.status });
    } else if (!oldStatus) {
      SagaManager.sagaStateChanges.inc({ saga_type: params.type, from_status: 'none', to_status: params.status });
      Logger.metric('saga_state_changes_total', 1, { saga_type: params.type, from_status: 'none', to_status: params.status });
    }

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
      Logger.error(`[SagaManager] Failed to save saga state`, error, { 
        correlationId: params.correlationId, 
        sagaId: params.sagaId 
      });
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
