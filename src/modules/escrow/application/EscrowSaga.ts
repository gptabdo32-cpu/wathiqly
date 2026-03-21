import { IEscrowRepository } from "../domain/IEscrowRepository";
import { Escrow } from "../domain/Escrow";
import { v4 as uuidv4 } from 'uuid';

export interface EscrowSagaInput {
  buyerId: number;
  sellerId: number;
  amount: string;
  description: string;
  sellerWalletAddress?: string;
}

/**
 * EscrowSaga Orchestrator (Deterministic State Machine)
 * 
 * MISSION: Stabilize the system mathematically and operationally.
 * 
 * Flow (Event-Driven):
 * 1. INIT -> Create Escrow (PENDING) + Create Saga Instance
 * 2. Emit EscrowCreatedEvent
 * 3. PaymentService listens -> Locks Funds -> Emits PaymentCompleted
 * 4. Saga listens to PaymentCompleted -> Transition to COMPLETED -> Update Escrow to LOCKED
 */
export class EscrowSaga {
  constructor(
    private escrowRepo: IEscrowRepository
  ) {}

  /**
   * Start the Saga.
   * NO TransactionManager here. Transactions are ONLY inside repositories.
   * NO Synchronous cross-service calls.
   */
  async start(input: EscrowSagaInput): Promise<string> {
    const correlationId = uuidv4();
    
    // 1. Create Domain Entity (Starts as PENDING - Task 7)
    const escrow = Escrow.create({
      buyerId: input.buyerId,
      sellerId: input.sellerId,
      amount: input.amount,
      description: input.description,
    });

    // 2. Persist Initial State & Saga Instance (Atomic inside Repo)
    // The repository should handle the local ACID transaction
    const escrowId = await this.escrowRepo.create(escrow);
    
    await this.escrowRepo.createSagaInstance({
      correlationId,
      escrowId,
      status: "ESCROW_CREATED",
      payload: { ...input, escrowId },
    });

    // 3. Emit EscrowCreatedEvent (Task 2)
    // This replaces paymentService.lockEscrowFunds()
    await this.escrowRepo.saveOutboxEvent({
      eventId: uuidv4(),
      aggregateType: "escrow",
      aggregateId: escrowId,
      eventType: "EscrowCreated",
      version: 1,
      payload: { 
        escrowId, 
        buyerId: input.buyerId, 
        amount: input.amount,
        correlationId 
      },
      correlationId,
      idempotencyKey: `escrow_created_${escrowId}`,
      status: "pending",
    } as any);

    return correlationId;
  }

  /**
   * Handle Payment Success (Task 5)
   */
  async handlePaymentCompleted(correlationId: string, escrowLedgerAccountId: number): Promise<void> {
    const saga = await this.escrowRepo.getSagaInstanceByCorrelationId(correlationId);
    if (!saga || saga.status !== "ESCROW_CREATED") return;

    const escrow = await this.escrowRepo.getById(saga.escrowId);
    if (!escrow) throw new Error("Escrow not found");

    // Transition Domain State
    escrow.lock();
    escrow.updateLedgerAccounts(escrowLedgerAccountId);

    // Persist changes & Update Saga (Atomic inside Repo)
    await this.escrowRepo.update(escrow);
    await this.escrowRepo.updateSagaStatus(correlationId, "COMPLETED");

    // Emit Final Event
    await this.escrowRepo.saveOutboxEvent({
      eventId: uuidv4(),
      aggregateType: "escrow",
      aggregateId: escrow.id!,
      eventType: "EscrowSagaCompleted",
      version: 1,
      payload: { escrowId: escrow.id, status: "LOCKED" },
      correlationId,
      idempotencyKey: `saga_completed_${correlationId}`,
      status: "pending",
    } as any);
  }

  /**
   * Handle Payment Failure (Task 4)
   */
  async handlePaymentFailed(correlationId: string, reason: string): Promise<void> {
    const saga = await this.escrowRepo.getSagaInstanceByCorrelationId(correlationId);
    if (!saga) return;

    await this.escrowRepo.updateSagaStatus(correlationId, "FAILED", reason);
    
    // Compensation logic would go here if needed
    // For now, we mark as FAILED to ensure determinism
  }
}
