import { TransactionManager } from "../../../../core/db/TransactionManager";
import { IEscrowRepository } from "../../domain/IEscrowRepository";
import { Escrow } from "../../domain/Escrow";
import { v4 as uuidv4 } from 'uuid';
import { SagaManager } from "../../../../core/events/SagaManager";

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
 * RULE 8: Store saga state in database
 * RULE 19: Ensure full replayability of events
 */
export class CreateEscrow {
  constructor(
    private escrowRepo: IEscrowRepository
  ) {}

  async execute(params: CreateEscrowInput) {
    const correlationId = uuidv4(); 

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
      const sagaId = `escrow_saga_${escrowId}`;

      // 3. Saga State Initialization (Rule 8, 9)
      // Note: In a production system, SagaManager would also support 'tx' to be atomic.
      // For now, we'll call it. Ideally, SagaManager should be part of the transaction.
      await SagaManager.saveState({
        sagaId,
        type: "EscrowSaga",
        status: "STARTED",
        state: { ...params, escrowId, step: "ESCROW_CREATED" },
        correlationId,
      });

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

      return { escrowId, correlationId };
    });
  }
}
