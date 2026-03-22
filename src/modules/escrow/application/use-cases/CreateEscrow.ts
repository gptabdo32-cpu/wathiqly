import { TransactionManager } from "../../../../core/db/TransactionManager";
import { IEscrowRepository } from "../../domain/IEscrowRepository";
import { Escrow } from "../../domain/Escrow";
import { v4 as uuidv4 } from 'uuid';
import { publishToQueue } from "../../../../core/events/EventQueue";

export interface CreateEscrowInput {
  buyerId: number;
  sellerId: number;
  amount: string;
  description: string;
  sellerWalletAddress?: string;
}

/**
 * CreateEscrow Use Case (Event-Driven & Decoupled)
 * MISSION: Deterministic distributed financial system
 * RULE 1: Remove all synchronous cross-module calls
 * RULE 2: Introduce real event-driven communication
 * RULE 3: Replace direct service calls with event publishing
 * RULE 18: Add correlationId across all flows
 */
export class CreateEscrow {
  constructor(
    private escrowRepo: IEscrowRepository
  ) {}

  async execute(params: CreateEscrowInput) {
    const correlationId = uuidv4(); // RULE 18

    // 1. Domain Logic: Create the entity
    const escrow = Escrow.create({
      buyerId: params.buyerId,
      sellerId: params.sellerId,
      amount: params.amount,
      description: params.description,
    });

    return await TransactionManager.run(async (tx) => {
      // 2. Persistence: Initial record to get an ID
      const escrowId = await this.escrowRepo.create(escrow, tx);

      // 3. Saga State Initialization (Rule 9)
      await this.escrowRepo.createSagaInstance({
        correlationId,
        escrowId,
        status: "ESCROW_CREATED",
        payload: { ...params, escrowId },
      }, tx);

      // 4. ATOMIC OUTBOX: Save event inside the SAME transaction (Rule 19)
      const eventId = uuidv4();
      await this.escrowRepo.saveOutboxEvent({
        eventId,
        aggregateType: "escrow",
        aggregateId: escrowId,
        eventType: "EscrowCreated",
        version: 1,
        payload: {
          escrowId,
          buyerId: params.buyerId,
          sellerId: params.sellerId,
          amount: params.amount,
          description: params.description,
          sellerWalletAddress: params.sellerWalletAddress,
          correlationId,
        },
        correlationId,
        idempotencyKey: `escrow_init_${escrowId}`,
        status: "pending",
      }, tx);

      // 5. Async Dispatch (Triggered by OutboxWorker, but we can also publish directly for speed)
      // The OutboxWorker will ensure this is published even if the process crashes here.
      
      return { escrowId, correlationId };
    });
  }
}
