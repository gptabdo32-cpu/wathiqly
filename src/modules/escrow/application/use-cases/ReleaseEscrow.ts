import { TransactionManager } from "../../../../core/db/TransactionManager";
import { IEscrowRepository } from "../../domain/IEscrowRepository";
import { v4 as uuidv4 } from 'uuid';
import { Logger } from "../../../../core/observability/Logger";

/**
 * ReleaseEscrow Use Case (Event-Driven)
 * RULE 1: Remove all synchronous cross-module calls
 * RULE 2: Introduce real event-driven communication
 * RULE 18: Add correlationId across all flows
 */
export class ReleaseEscrow {
  constructor(
    private escrowRepo: IEscrowRepository
  ) {}

  async execute(escrowId: number) {
    const correlationId = uuidv4();

    return await TransactionManager.run(async (tx) => {
      // 1. Persistence: Get contract via Repository
      const escrow = await this.escrowRepo.getById(escrowId, tx);
      if (!escrow) throw new Error("Escrow not found");
      
      // 2. Domain Rule: Perform transition inside the Entity
      // We don't release yet, we start a ReleaseSaga
      
      // 3. Saga State Initialization
      await this.escrowRepo.createSagaInstance({
        correlationId,
        escrowId,
        status: "RELEASE_STARTED",
        payload: { escrowId },
      }, tx);

      // 4. ATOMIC OUTBOX: Save event inside the SAME transaction
      await this.escrowRepo.saveOutboxEvent({
        eventId: uuidv4(),
        aggregateType: "escrow",
        aggregateId: escrowId,
        eventType: "EscrowReleaseRequested",
        version: 1,
        payload: {
          escrowId,
          buyerId: escrow.buyerId,
          sellerId: escrow.sellerId,
          amount: escrow.amount,
          escrowLedgerAccountId: escrow.escrowLedgerAccountId,
          correlationId,
        },
        correlationId,
        idempotencyKey: `escrow_release_req_${escrowId}`,
        status: "pending",
      }, tx);

      Logger.info(`[ReleaseEscrow][CID:${correlationId}] Release requested for Escrow #${escrowId}`);

      return { success: true, correlationId };
    });
  }
}
