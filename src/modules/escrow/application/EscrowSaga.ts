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
   */
  async start(input: EscrowSagaInput): Promise<string> {
    const correlationId = uuidv4();
    
    const escrow = Escrow.create({
      buyerId: input.buyerId,
      sellerId: input.sellerId,
      amount: input.amount,
      description: input.description,
    });

    const escrowId = await this.escrowRepo.create(escrow);
    
    await this.escrowRepo.createSagaInstance({
      correlationId,
      escrowId,
      status: "ESCROW_CREATED",
      payload: { ...input, escrowId } as unknown as Record<string, unknown>,
    });

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
    });

    return correlationId;
  }

  /**
   * Handle Payment Success (Task 8 - Idempotent & Deterministic)
   */
  async handlePaymentCompleted(correlationId: string, escrowLedgerAccountId: number): Promise<void> {
    const saga = await this.escrowRepo.getSagaInstanceByCorrelationId(correlationId) as any;
    if (!saga) return;
    
    if (saga.status === "COMPLETED") return;
    
    if (saga.status !== "ESCROW_CREATED") {
        throw new Error(`Invalid saga state for payment completion: ${saga.status}`);
    }

    const escrow = await this.escrowRepo.getById(saga.escrowId);
    if (!escrow) throw new Error("Escrow not found");

    if (escrow.canBeLocked()) {
        escrow.lock();
        escrow.updateLedgerAccounts(escrowLedgerAccountId);
        await this.escrowRepo.update(escrow);
    }

    await this.escrowRepo.updateSagaStatus(correlationId, "COMPLETED");

    await this.escrowRepo.saveOutboxEvent({
      eventId: uuidv4(),
      aggregateType: "escrow",
      aggregateId: escrow.id!,
      eventType: "EscrowSagaCompleted",
      version: 1,
      payload: { 
        escrowId: escrow.id!, 
        status: "LOCKED",
        timestamp: new Date().toISOString()
      },
      correlationId,
      idempotencyKey: `saga_completed_${correlationId}`,
      status: "pending",
    });
  }

  /**
   * Handle Payment Failure (Task 4)
   */
  async handlePaymentFailed(correlationId: string, reason: string): Promise<void> {
    const saga = await this.escrowRepo.getSagaInstanceByCorrelationId(correlationId) as any;
    if (!saga) return;

    await this.escrowRepo.updateSagaStatus(correlationId, "FAILED", reason);
  }
}
