import { TransactionManager } from "../../../../core/db/TransactionManager";
import { IEscrowRepository } from "../../domain/IEscrowRepository";
import { Escrow } from "../../domain/Escrow";
import { v4 as uuidv4 } from 'uuid';
import { SagaManager } from "../../../../core/events/SagaManager";
import { eventBus } from "../../../../core/events/EventBus"; // استيراد eventBus
import { IdempotencyManager } from "../../../../core/events/IdempotencyManager"; // استيراد IdempotencyManager

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
    const idempotencyKey = `escrow_init_${correlationId}`; // استخدام correlationId لضمان فرادة مفتاح Idempotency

    // 1. التحقق من Idempotency
    const idempotencyCheck = await IdempotencyManager.checkIdempotency({ idempotencyKey, correlationId });
    if (idempotencyCheck.isDuplicate) {
      if (idempotencyCheck.result) {
        return idempotencyCheck.result; // إعادة النتيجة المخزنة للعملية المكتملة
      } else if (idempotencyCheck.error) {
        throw new Error(`Previous attempt failed: ${idempotencyCheck.error}`);
      } else {
        // لا تزال العملية قيد المعالجة، يمكن الانتظار أو رمي خطأ
        throw new Error("Operation is already being processed.");
      }
    }

    return await TransactionManager.run(async (context) => {
      const tx = context.tx;

      // 2. Domain Logic: Create the entity
      const escrow = Escrow.create({
        buyerId: params.buyerId,
        sellerId: params.sellerId,
        amount: params.amount,
        description: params.description,
      });

      // 3. Persistence: Initial record to get an ID
      const escrowId = await this.escrowRepo.create(escrow, tx);
      const sagaId = `escrow_saga_${escrowId}`;

      // 4. Saga State Initialization (الآن ذرية مع المعاملة)
      await SagaManager.saveState({
        sagaId,
        type: "EscrowSaga",
        status: "STARTED",
        state: { ...params, escrowId, step: "ESCROW_CREATED" },
        correlationId,
        tx, // تمرير المعاملة لضمان الذرية
      });

      // 5. ATOMIC OUTBOX: Save event inside the SAME transaction
      const eventId = uuidv4();
      await eventBus.publish("EscrowCreated", {
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
        idempotencyKey,
      }, tx); // تمرير المعاملة

      // 6. تسجيل العملية كـ PROCESSING في IdempotencyManager
      await IdempotencyManager.markProcessing({
        idempotencyKey,
        eventId,
        aggregateId: escrowId,
        aggregateType: "escrow",
        eventType: "EscrowCreated",
        correlationId,
        tx,
      });

      const result = { escrowId, correlationId };

      // 7. تسجيل العملية كـ COMPLETED في IdempotencyManager عند النجاح
      await IdempotencyManager.markCompleted({
        idempotencyKey,
        result,
        correlationId,
        tx,
      });

      return result;
    });
  }
}
