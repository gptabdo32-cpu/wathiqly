import { Logger } from '../observability/Logger';
import { DistributedLock } from '../locking/DistributedLock';
import { SagaManager } from './SagaManager';
import { SagaStatus, SagaType } from './SagaTypes';

/**
 * Atomic Saga Executor (Improvements 1, 2, 10, 17)
 * MISSION: Ensure saga state transitions are atomic and cannot be interrupted.
 * 
 * Guarantees:
 * - Only one process can modify a saga at a time (via distributed lock)
 * - State transitions are atomic (version-based optimistic concurrency)
 * - No double execution under concurrent access
 * - Automatic retry on optimistic concurrency conflicts
 * 
 * Usage:
 * await AtomicSagaExecutor.execute({
 *   sagaId: 'saga_123',
 *   correlationId: 'corr_456',
 *   operation: async () => {
 *     // Your saga state transition logic here
 *     return newState;
 *   }
 * });
 */
export class AtomicSagaExecutor {
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAY_MS = 100;

  /**
   * Execute a saga operation atomically.
   * 
   * @param sagaId - Unique identifier for the saga
   * @param correlationId - Correlation ID for tracing
   * @param operation - Async function that performs the saga state transition
   * @param sagaType - Type of saga (for logging)
   * @returns Result of the operation
   */
  static async execute<T>(params: {
    sagaId: string;
    correlationId: string;
    operation: () => Promise<T>;
    sagaType?: string;
  }): Promise<T> {
    const { sagaId, correlationId, operation, sagaType = 'Unknown' } = params;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        Logger.info(
          `[AtomicSagaExecutor][CID:${correlationId}] Executing saga operation (attempt ${attempt}/${this.MAX_RETRIES}): ${sagaId}`,
          { sagaType }
        );

        // Acquire distributed lock to prevent concurrent modifications
        const lockAcquired = await DistributedLock.withLock(
          `saga:${sagaId}`,
          correlationId,
          async () => {
            // Execute the operation within the lock
            return await operation();
          },
          30000 // 30 second TTL
        );

        Logger.info(
          `[AtomicSagaExecutor][CID:${correlationId}] Saga operation completed successfully: ${sagaId}`,
          { sagaType, attempt }
        );

        return lockAcquired;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if this is an optimistic concurrency conflict
        if (lastError.message.includes('Optimistic concurrency conflict')) {
          Logger.warn(
            `[AtomicSagaExecutor][CID:${correlationId}] Optimistic concurrency conflict detected (attempt ${attempt}/${this.MAX_RETRIES}): ${sagaId}`,
            { error: lastError.message }
          );

          if (attempt < this.MAX_RETRIES) {
            // Wait before retrying
            await new Promise((resolve) =>
              setTimeout(resolve, this.RETRY_DELAY_MS * Math.pow(2, attempt - 1))
            );
            continue;
          }
        }

        // For other errors, log and throw immediately
        Logger.error(
          `[AtomicSagaExecutor][CID:${correlationId}] Saga operation failed: ${sagaId}`,
          lastError,
          { sagaType, attempt }
        );

        throw lastError;
      }
    }

    // If we've exhausted all retries
    throw new Error(
      `[AtomicSagaExecutor] Failed to execute saga operation after ${this.MAX_RETRIES} attempts: ${sagaId}. Last error: ${lastError?.message}`
    );
  }

  /**
   * Safely transition a saga to a new state.
   * Combines distributed locking with optimistic concurrency control.
   */
  static async transitionState<T extends SagaType>(params: {
    sagaId: string;
    type: T;
    newStatus: SagaStatus;
    newState: any;
    correlationId: string;
  }): Promise<void> {
    const { sagaId, type, newStatus, newState, correlationId } = params;

    await this.execute({
      sagaId,
      correlationId,
      sagaType: type,
      operation: async () => {
        // Save the new state with optimistic concurrency control
        await SagaManager.saveState({
          sagaId,
          type,
          status: newStatus,
          state: newState,
          correlationId,
        });

        Logger.info(
          `[AtomicSagaExecutor][CID:${correlationId}] State transition completed: ${sagaId} -> ${newStatus}`,
          { sagaType: type }
        );

        return true;
      },
    });
  }

  /**
   * Check if a saga can transition to a new state.
   * Validates state machine rules before attempting transition.
   */
  static validateTransition(
    currentStatus: SagaStatus,
    targetStatus: SagaStatus,
    allowedTransitions: Record<SagaStatus, SagaStatus[]>
  ): boolean {
    const allowed = allowedTransitions[currentStatus] || [];
    return allowed.includes(targetStatus);
  }
}

export default AtomicSagaExecutor;
