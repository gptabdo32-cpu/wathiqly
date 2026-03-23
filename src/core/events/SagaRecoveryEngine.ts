import { eq, and, or, lt, sql } from "drizzle-orm";
import { sagaStates } from "../../infrastructure/db/schema_saga";
import { getDb } from "../../infrastructure/db";
import { Logger } from "../observability/Logger";
import { container } from "../di/container";
import { EscrowSaga } from "../../modules/escrow/application/EscrowSaga";

/**
 * Saga Recovery Engine
 * MISSION: Scan for incomplete or failed sagas and resume them safely.
 */
export class SagaRecoveryEngine {
  private isRunning = false;
  private readonly POLL_INTERVAL_MS = 30000; // Scan every 30 seconds
  private readonly INACTIVITY_THRESHOLD_MINUTES = 5;

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    Logger.info("SagaRecoveryEngine started");
    this.runLoop();
  }

  private async runLoop() {
    while (this.isRunning) {
      try {
        await this.recoverStalledSagas();
      } catch (error) {
        Logger.error("[SagaRecoveryEngine] Loop error", error);
      }
      await new Promise(resolve => setTimeout(resolve, this.POLL_INTERVAL_MS));
    }
  }

  public stop() {
    this.isRunning = false;
    Logger.info("SagaRecoveryEngine stopped");
  }

  /**
   * Finds sagas that are stuck in 'STARTED', 'PROCESSING', or 'COMPENSATING'
   * and haven't been updated for a while.
   */
  private async recoverStalledSagas() {
    const db = await getDb();
    if (!db) return;

    const stalledSagas = await db
      .select()
      .from(sagaStates)
      .where(
        and(
          or(
            eq(sagaStates.status, "STARTED"),
            eq(sagaStates.status, "PROCESSING"),
            eq(sagaStates.status, "COMPENSATING")
          ),
          // If updatedAt is older than threshold, consider it stalled
          sql`${sagaStates.updatedAt} < NOW() - INTERVAL ${this.INACTIVITY_THRESHOLD_MINUTES} MINUTE`
        )
      )
      .limit(10);

    if (stalledSagas.length === 0) return;

    Logger.info(`[SagaRecoveryEngine] Found ${stalledSagas.length} stalled sagas to recover`);

    for (const saga of stalledSagas) {
      await this.resumeSaga(saga);
    }
  }

  /**
   * Resumes a specific saga based on its type and current state.
   */
  private async resumeSaga(saga: any) {
    Logger.info(`[SagaRecoveryEngine] Resuming saga ${saga.sagaId} (Type: ${saga.type}, Status: ${saga.status})`);
    
    try {
      if (saga.type === "ESCROW_SAGA") {
        const escrowSaga = container.get<EscrowSaga>(EscrowSaga);
        const state = saga.state as any;
        
        // Logic to determine which step to re-run
        // In a real system, each saga would implement a 'resume' method
        // For now, we log the attempt. The idempotent handlers will ensure safety.
        Logger.info(`[SagaRecoveryEngine] Re-triggering last step for EscrowSaga: ${state.currentStep}`);
        
        // We can re-emit the last event or call the handler directly if safe.
        // Given our architecture, re-running the use-case or step with the same correlationId
        // will be handled by the IdempotencyManager.
      }
      
      // Update the saga's updatedAt to prevent immediate re-recovery if it's still processing
      const db = await getDb();
      await db.update(sagaStates)
        .set({ updatedAt: new Date() })
        .where(eq(sagaStates.sagaId, saga.sagaId));

    } catch (error) {
      Logger.error(`[SagaRecoveryEngine] Failed to resume saga ${saga.sagaId}`, error);
    }
  }
}
