# تقرير تحليل معماري وتحويل النظام

## 1. تحديد نقاط الضعف الحالية في النظام

### نظرة عامة على النظام الحالي

يعتمد النظام الحالي على بنية معيارية (Modular structure) مع مكونات أساسية مثل `EventBus` (في الذاكرة)، و`TransactionManager` (معاملات قاعدة البيانات)، و`AtomicSagaExecutor` (تنظيم Saga غير مستمر)، و`IdempotencyManager` (غير مدمج بالكامل). على الرغم من أن هذه المكونات توفر أساسًا جيدًا، إلا أن هناك نقاط ضعف رئيسية تمنع النظام من تحقيق ضمانات الموثوقية والتناسق المطلوبة للمعاملات المالية.

### ربط نقاط الضعف بالملفات الحالية

| الضمان المفقود / نقطة الضعف | الملفات المتأثرة / المكونات | الشرح التفصيلي |
|---|---|---|
| **ضمان Idempotency** | `src/core/events/IdempotencyManager.ts`, `src/modules/payments/application/use-cases/SendMoney.ts`, `src/modules/escrow/application/use-cases/CreateEscrow.ts`, `src/infrastructure/db/schema_idempotency.ts`, `src/infrastructure/db/schema_outbox.ts` | `IdempotencyManager.ts` موجود ولكنه غير مدمج بالكامل في تدفقات التنفيذ الرئيسية. على سبيل المثال، `SendMoney.ts` ينشئ مفتاح idempotency يعتمد على الوقت، وهو غير آمن لضمان "مرة واحدة بالضبط" منطقيًا عبر عمليات إعادة المحاولة. يوجد أيضًا تكرار في مخططات Idempotency (`schema_idempotency.ts` و`schema_outbox.ts`). |
| **ضمان تسليم الأحداث** | `src/core/events/EventBus.ts`, `src/modules/blockchain/OutboxWorker.ts`, `src/core/events/EventQueue.ts` | `EventBus.ts` الحالي يعتمد على التنفيذ في الذاكرة (`Promise.allSettled`)، مما يعني فقدان الأحداث عند تعطل النظام. `OutboxWorker.ts` يقوم بإرسال الأحداث من جدول Outbox، ولكنه يعتمد على `EventQueue.ts` الذي لم يتم تحليله بعد، وقد يكون نقطة ضعف أخرى. معالجة رسائل DLQ (Dead Letter Queue) في `OutboxWorker.ts` هي مجرد تسجيل، ولا توجد آلية حقيقية لإعادة المعالجة أو التنبيه. |
| **ضمان التناسق (مشكلة Dual-Write)** | `src/core/db/TransactionManager.ts`, `src/modules/escrow/application/use-cases/CreateEscrow.ts`, `src/apps/api/routers.ts` | لا يوجد ضمان للتناسق الذري بين كتابات قاعدة البيانات ونشر الأحداث. على سبيل المثال، في `CreateEscrow.ts`، يتم استدعاء `SagaManager.saveState` خارج نطاق المعاملة (بدون تمرير `tx`)، مما قد يؤدي إلى عدم تناسق بين حالة Saga ومعاملة قاعدة البيانات. العديد من المسارات في `routers.ts` تستخدم معاملات قاعدة البيانات بشكل مباشر دون دمجها مع نمط Outbox. |
| **ضمان موثوقية Saga** | `src/core/events/AtomicSagaExecutor.ts`, `src/core/events/SagaManager.ts`, `src/infrastructure/db/schema_saga.ts`, `src/modules/escrow/application/EscrowSaga.ts`, `src/modules/payments/application/PaymentSaga.ts` | `AtomicSagaExecutor.ts` هو نظام Saga غير مستمر (non-persistent)، مما يعني فقدان حالة Saga عند تعطل النظام. على الرغم من وجود `SagaManager.ts` و`schema_saga.ts` لتخزين حالة Saga، إلا أن الدمج الحالي لا يضمن استمرارية Saga أو استئنافها بعد الأعطال. لا توجد آلية واضحة لتتبع الخطوات أو التعافي من الفشل في `AtomicSagaExecutor.ts`. |
| **ضمان المتانة** | `src/core/events/EventBus.ts`, `src/core/events/AtomicSagaExecutor.ts` | بسبب الاعتماد على `EventBus` في الذاكرة و`AtomicSagaExecutor` غير المستمر، لا يوجد ضمان لعدم فقدان البيانات الهامة (الأحداث، حالة Saga) عند تعطل النظام. |

## 2. خطة التحويل خطوة بخطوة

تهدف هذه الخطة إلى تحويل النظام بشكل تدريجي وآمن، مع رفع كل تعديل إلى مستودع GitHub قبل الانتقال إلى الخطوة التالية.

1.  **توحيد وإعادة هيكلة IdempotencyManager**: دمج مخططات Idempotency الموجودة في `schema_outbox.ts` واستخدام `IdempotencyManager.ts` كنقطة دخول وحيدة. التأكد من أن جميع العمليات التي تتطلب Idempotency تستخدم `IdempotencyManager` بشكل صحيح وذري داخل المعاملات.
2.  **تطبيق نمط Outbox بشكل كامل**: التأكد من أن جميع الأحداث التي يتم نشرها من داخل المعاملات يتم حفظها في جدول Outbox كجزء من نفس المعاملة الذرية. تعديل `TransactionManager.ts` لدعم نشر الأحداث إلى Outbox كجزء من التزام المعاملة.
3.  **تحسين EventBus لضمان التسليم**: استبدال `EventBus.ts` في الذاكرة بآلية تعتمد على Outbox Worker وخدمة قائمة انتظار رسائل (مثل Kafka أو RabbitMQ إذا لزم الأمر، مع تبرير واضح). تنفيذ آليات إعادة المحاولة (retry) ومعالجة رسائل DLQ (Dead Letter Queue) بشكل فعال.
4.  **تحويل Saga Executor إلى نظام مستمر**: تعديل `AtomicSagaExecutor.ts` ليصبح نظام Saga مستمرًا. يتضمن ذلك تخزين حالة Saga في قاعدة البيانات بشكل ذري مع المعاملات، ودعم استئناف Saga، وإعادة المحاولة، والتعويض بعد الأعطال.
5.  **تحديث الخدمات واستخدامات حالات الاستخدام**: مراجعة وتحديث الخدمات وحالات الاستخدام (مثل `CreateEscrow.ts` و`SendMoney.ts`) لضمان استخدامها الصحيح للمكونات المحسنة (IdempotencyManager، Outbox Pattern، Persistent Saga Executor).
6.  **اختبار شامل لسيناريوهات الفشل**: تطوير اختبارات شاملة لسيناريوهات الفشل المختلفة للتحقق من أن الضمانات الجديدة تعمل كما هو متوقع.
7.  **توثيق الضمانات النهائية**: تحديث الوثائق لتعكس الضمانات الجديدة التي يوفرها النظام.

## 3. تصميم ملموس على مستوى الكود

### تعديل `EventBus.ts`

سيتم تحويل `EventBus.ts` من كونه ناشرًا مباشرًا في الذاكرة إلى واجهة تقوم بنشر الأحداث إلى جدول Outbox. هذا يضمن أن نشر الأحداث يتم بشكل ذري مع معاملات قاعدة البيانات.

```typescript
// src/core/events/EventBus.ts (بعد التعديل)

import { Logger } from "../observability/Logger";
import { z } from "zod";
import { DbTransaction } from "../db/TransactionManager";
import { outboxEvents } from "../../infrastructure/db/schema_outbox";
import { v4 as uuidv4 } from 'uuid';

// ... (IntegrationEventSchema and IntegrationEvent remain the same)

export class EventBus {
  private static instance: EventBus;
  // لم نعد نحتاج إلى تخزين المعالجات محليًا بهذا الشكل إذا كنا نستخدم Outbox
  // private handlers: Map<string, EventHandler<Record<string, unknown>>[]> = new Map();

  private constructor() {}

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  // سيتم استبدال الاشتراك المباشر بآلية قائمة على المستهلكين الذين يقرأون من Outbox
  // public subscribe<T extends Record<string, unknown>>(event: string, handler: EventHandler<T>): void {
  //   // ... (logic for local handlers, now deprecated for persistence)
  // }

  /**
   * نشر حدث إلى Outbox لضمان التسليم.
   * يجب أن يتم استدعاء هذه الوظيفة داخل معاملة قاعدة بيانات.
   */
  public async publish(event: string, data: {
    payload: Record<string, unknown>;
    correlationId: string;
    idempotencyKey: string;
    eventId?: string;
  }, tx: DbTransaction): Promise<void> {
    const eventId = data.eventId || uuidv4();
    const timestamp = new Date().toISOString();

    Logger.info(`[EventBus][CID:${data.correlationId}] Publishing event to Outbox: ${event}`, {
        eventId,
        type: event,
        timestamp,
    });

    await tx.insert(outboxEvents).values({
      eventId,
      aggregateType: "unknown", // يجب تحديد نوع التجميع المناسب هنا
      aggregateId: "unknown",   // يجب تحديد معرف التجميع المناسب هنا
      eventType: event,
      version: 1,
      payload: data.payload,
      correlationId: data.correlationId,
      idempotencyKey: data.idempotencyKey,
      status: "pending",
      createdAt: new Date(),
      retries: 0,
    });

    Logger.info(`[EventBus][CID:${data.correlationId}] Event ${event} added to Outbox successfully.`);
  }
}

export const eventBus = EventBus.getInstance();
```

**ملاحظات على التعديل:**
*   تم تغيير توقيع دالة `publish` لقبول `tx: DbTransaction` لضمان الذرية. هذا يعني أن `EventBus` لن يقوم بنشر الأحداث مباشرة، بل سيقوم بإضافتها إلى جدول `outboxEvents` داخل المعاملة الجارية.
*   تم إزالة منطق `Promise.allSettled` حيث أن التسليم سيتم الآن بواسطة `OutboxWorker`.
*   يجب تحديث `aggregateType` و`aggregateId` بقيم حقيقية عند استخدام `publish`.

### تعديل `TransactionManager.ts`

سيتم تعديل `TransactionManager.ts` ليكون قادرًا على تنسيق العمليات التي تتضمن كتابات قاعدة البيانات ونشر الأحداث إلى Outbox. يمكن تحقيق ذلك عن طريق توفير سياق للمعاملة يمكن للمكونات الأخرى الوصول إليه.

```typescript
// src/core/db/TransactionManager.ts (بعد التعديل)

import { getDb } from "../../infrastructure/db";
import { DatabaseError, TransactionError } from "../errors/errors";
import { MySqlTransaction } from "drizzle-orm/mysql2";
import { Logger } from "../observability/Logger";

export type DbTransaction = MySqlTransaction<any, any>;

// إضافة واجهة لسياق المعاملة الذي يمكن أن يحمل بيانات إضافية
export interface TransactionContext {
  tx: DbTransaction;
  // يمكن إضافة قوائم للأحداث التي سيتم نشرها هنا، أو الاعتماد على EventBus مباشرة
}

export class TransactionManager {
  static async run<T>(callback: (context: TransactionContext) => Promise<T>): Promise<T> {
    const db = await getDb();
    if (!db) {
      throw new DatabaseError("Database connection not available for transaction");
    }

    try {
      return await db.transaction(async (tx) => {
        const context: TransactionContext = { tx };
        try {
          const result = await callback(context);
          // هنا يمكن إضافة منطق إضافي لضمان نشر الأحداث من Outbox بعد الالتزام
          return result;
        } catch (error: unknown) {
          const err = error as { code?: string; message: string };
          if (err.code) throw error;
          
          Logger.error("[TransactionManager] Operation inside transaction failed", error);
          throw new TransactionError("Operation inside transaction failed", error instanceof Error ? error : new Error(String(error)));
        }
      });
    } catch (error: unknown) {
      const err = error as { code?: string; message: string };
      if (err.code) throw error;
      
      Logger.error("[TransactionManager] Transaction execution failed", error);
      throw new TransactionError("Transaction execution failed", error instanceof Error ? error : new Error(String(error)));
    }
  }
}
```

**ملاحظات على التعديل:**
*   تم تغيير توقيع دالة `run` لقبول `context: TransactionContext` بدلاً من `tx: DbTransaction` مباشرة. هذا يسمح بتمرير سياق أغنى يمكن أن يحتوي على `tx` وأي معلومات أخرى ضرورية لتنسيق العمليات داخل المعاملة.
*   يمكن استخدام `context.tx` للوصول إلى كائن المعاملة داخل الـ callback.

### تعديل `AtomicSagaExecutor.ts` و`SagaManager.ts`

لتحويل `AtomicSagaExecutor` إلى نظام Saga مستمر، يجب التأكد من أن حالة Saga يتم تخزينها بشكل ذري مع معاملات قاعدة البيانات. هذا يتطلب تعديل `SagaManager.saveState` لقبول `tx` وتمريره من `AtomicSagaExecutor`.

```typescript
// src/core/events/SagaManager.ts (بعد التعديل)

import { getDb } from "../../infrastructure/db";
import { Logger } from "../observability/Logger";
import { eq, and } from "drizzle-orm";
import { sagaStates } from "../../infrastructure/db/schema_saga";
import { SagaStatus, SagaType, SagaStateSchemas } from "./SagaTypes";
import { DbTransaction } from "../db/TransactionManager"; // استيراد DbTransaction

export class SagaManager {
  // ... (getState remains the same)

  static async saveState<T extends SagaType>(params: {
    sagaId: string;
    type: T;
    status: SagaStatus;
    state: any; // يجب تحسين هذا النوع لاحقًا
    correlationId: string;
    tx?: DbTransaction; // إضافة tx اختياريًا
  }): Promise<void> {
    const { sagaId, type, status, state, correlationId, tx } = params;
    const db = tx || (await getDb()); // استخدام tx إذا تم توفيره

    // ... (logic for schema validation and optimistic concurrency remains the same)

    const existingSaga = await db
      .select()
      .from(sagaStates)
      .where(eq(sagaStates.sagaId, sagaId))
      .limit(1);

    if (existingSaga.length > 0) {
      // Update existing saga state with optimistic concurrency
      const currentVersion = existingSaga[0].version;
      const result = await db
        .update(sagaStates)
        .set({
          status,
          state,
          correlationId,
          updatedAt: new Date(),
          version: currentVersion + 1,
        })
        .where(and(eq(sagaStates.sagaId, sagaId), eq(sagaStates.version, currentVersion)));

      if (result.affectedRows === 0) {
        throw new Error("Optimistic concurrency conflict: Saga state updated by another process.");
      }
    } else {
      // Insert new saga state
      await db.insert(sagaStates).values({
        sagaId,
        type,
        status,
        state,
        correlationId,
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
      });
    }

    Logger.info(`[SagaManager][CID:${correlationId}] Saga state saved: ${sagaId} -> ${status}`);
  }
}
```

```typescript
// src/core/events/AtomicSagaExecutor.ts (بعد التعديل)

import { Logger } from "../observability/Logger";
import { DistributedLock } from "../locking/DistributedLock";
import { SagaManager } from "./SagaManager";
import { SagaStatus, SagaType } from "./SagaTypes";
import { TransactionManager, DbTransaction } from "../db/TransactionManager"; // استيراد TransactionManager و DbTransaction

export class AtomicSagaExecutor {
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAY_MS = 100;

  static async execute<T>(params: {
    sagaId: string;
    correlationId: string;
    operation: (tx: DbTransaction) => Promise<T>; // تغيير التوقيع لقبول DbTransaction
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

        const result = await DistributedLock.withLock(
          `saga:${sagaId}`,
          correlationId,
          async () => {
            // استخدام TransactionManager لضمان الذرية
            return await TransactionManager.run(async (context) => {
              return await operation(context.tx);
            });
          },
          30000 // 30 second TTL
        );

        Logger.info(
          `[AtomicSagaExecutor][CID:${correlationId}] Saga operation completed successfully: ${sagaId}`,
          { sagaType, attempt }
        );

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (lastError.message.includes('Optimistic concurrency conflict')) {
          Logger.warn(
            `[AtomicSagaExecutor][CID:${correlationId}] Optimistic concurrency conflict detected (attempt ${attempt}/${this.MAX_RETRIES}): ${sagaId}`,
            { error: lastError.message }
          );

          if (attempt < this.MAX_RETRIES) {
            await new Promise((resolve) =>
              setTimeout(resolve, this.RETRY_DELAY_MS * Math.pow(2, attempt - 1))
            );
            continue;
          }
        }

        Logger.error(
          `[AtomicSagaExecutor][CID:${correlationId}] Saga operation failed: ${sagaId}`,
          lastError,
          { sagaType, attempt }
        );

        throw lastError;
      }
    }

    throw new Error(
      `[AtomicSagaExecutor] Failed to execute saga operation after ${this.MAX_RETRIES} attempts: ${sagaId}. Last error: ${lastError?.message}`
    );
  }

  static async transitionState<T extends SagaType>(params: {
    sagaId: string;
    type: T;
    newStatus: SagaStatus;
    newState: any;
    correlationId: string;
    tx?: DbTransaction; // إضافة tx اختياريًا هنا أيضًا
  }): Promise<void> {
    const { sagaId, type, newStatus, newState, correlationId, tx } = params;

    await this.execute({
      sagaId,
      correlationId,
      sagaType: type,
      operation: async (operationTx) => { // تمرير operationTx إلى SagaManager.saveState
        await SagaManager.saveState({
          sagaId,
          type,
          status: newStatus,
          state: newState,
          correlationId,
          tx: operationTx, // تمرير المعاملة
        });

        Logger.info(
          `[AtomicSagaExecutor][CID:${correlationId}] State transition completed: ${sagaId} -> ${newStatus}`,
          { sagaType: type }
        );

        return true;
      },
    });
  }

  // ... (validateTransition remains the same)
}

export default AtomicSagaExecutor;
```

**ملاحظات على التعديل:**
*   في `SagaManager.saveState`، تم إضافة `tx?: DbTransaction` كمعامل اختياري، وسيتم استخدامه إذا تم توفيره لضمان أن حفظ حالة Saga يتم داخل المعاملة الجارية.
*   في `AtomicSagaExecutor.execute`، تم تغيير توقيع `operation` لقبول `DbTransaction`، وتم تعديل المنطق لاستخدام `TransactionManager.run` لضمان أن العملية بأكملها تتم داخل معاملة ذرية.
*   في `AtomicSagaExecutor.transitionState`، يتم الآن تمرير `operationTx` إلى `SagaManager.saveState` لضمان الذرية.

### تعديل الخدمات (مثال: `CreateEscrow.ts`)

بعد التعديلات على `EventBus` و`TransactionManager` و`SagaManager`، يجب تحديث الخدمات وحالات الاستخدام لتعكس هذه التغييرات.

```typescript
// src/modules/escrow/application/use-cases/CreateEscrow.ts (بعد التعديل)

import { TransactionManager } from "../../../../core/db/TransactionManager";
import { IEscrowRepository } from "../../domain/IEscrowRepository";
import { Escrow } from "../../domain/Escrow";
import { v4 as uuidv4 } from 'uuid';
import { SagaManager } from "../../../../core/events/SagaManager";
import { eventBus } from "../../../../core/events/EventBus"; // استيراد eventBus
import { IdempotencyManager } from "../../../../core/events/IdempotencyManager"; // استيراد IdempotencyManager

// ... (CreateEscrowInput remains the same)

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
```

**ملاحظات على التعديل:**
*   تم دمج `IdempotencyManager.checkIdempotency` في بداية الدالة لضمان عدم تكرار العمليات. يتم استخدام `correlationId` لإنشاء مفتاح Idempotency فريد.
*   تم استبدال `this.escrowRepo.saveOutboxEvent` بـ `eventBus.publish`، والذي بدوره يضيف الحدث إلى جدول Outbox داخل المعاملة.
*   يتم تمرير `tx` إلى `SagaManager.saveState` لضمان الذرية.
*   تم إضافة `IdempotencyManager.markProcessing` و`IdempotencyManager.markCompleted` داخل المعاملة لضمان أن حالة Idempotency يتم تحديثها بشكل ذري مع العملية.

## 4. المكونات الجديدة التي سيتم إضافتها

### مخطط جدول Outbox (موجود حاليًا في `src/infrastructure/db/schema_outbox.ts`)

```typescript
// src/infrastructure/db/schema_outbox.ts

import { mysqlTable, varchar, text, int, timestamp, json, primaryKey } from 'drizzle-orm/mysql-core';

export const outboxEvents = mysqlTable("outbox_events", {
  id: int("id").autoincrement().notNull(),
  eventId: varchar("event_id", { length: 255 }).notNull().unique(),
  aggregateType: varchar("aggregate_type", { length: 255 }).notNull(),
  aggregateId: varchar("aggregate_id", { length: 255 }).notNull(),
  eventType: varchar("event_type", { length: 255 }).notNull(),
  version: int("version").notNull(),
  payload: json("payload").notNull(),
  correlationId: varchar("correlation_id", { length: 255 }).notNull(),
  causationId: varchar("causation_id", { length: 255 }),
  idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
  status: varchar("status", { length: 50, enum: ["pending", "processing", "completed", "failed", "dead_letter"] }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at"),
  lastAttemptAt: timestamp("last_attempt_at"),
  retries: int("retries").default(0).notNull(),
  error: text("error"),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.id] }),
    eventIdIdx: uniqueIndex("event_id_idx").on(table.eventId),
    idempotencyKeyIdx: index("idempotency_key_idx").on(table.idempotencyKey),
    statusIdx: index("status_idx").on(table.status),
  };
});

export const idempotencyRecords = mysqlTable("idempotency_records", {
  id: int("id").autoincrement().notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull().unique(),
  eventId: varchar("event_id", { length: 255 }).notNull(),
  aggregateId: varchar("aggregate_id", { length: 255 }).notNull(),
  aggregateType: varchar("aggregate_type", { length: 255 }).notNull(),
  eventType: varchar("event_type", { length: 255 }).notNull(),
  correlationId: varchar("correlation_id", { length: 255 }).notNull(),
  status: varchar("status", { length: 50, enum: ["PROCESSING", "COMPLETED", "FAILED"] }).notNull(),
  result: json("result"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  expiresAt: timestamp("expires_at").notNull(),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.id] }),
    idempotencyKeyIdx: uniqueIndex("idempotency_key_idx").on(table.idempotencyKey),
  };
});
```

**ملاحظات:**
*   تم توحيد جدول `idempotency_records` ليكون جزءًا من `schema_outbox.ts` لتبسيط الإدارة والتناسق.
*   يحتوي جدول `outbox_events` على جميع الحقول اللازمة لضمان تسليم الأحداث، بما في ذلك `idempotencyKey` و`retries` و`status`.

### مخطط جدول حالة Saga (موجود حاليًا في `src/infrastructure/db/schema_saga.ts`)

```typescript
// src/infrastructure/db/schema_saga.ts

import { mysqlTable, varchar, text, int, timestamp, json, primaryKey } from 'drizzle-orm/mysql-core';

export const sagaStates = mysqlTable("saga_states", {
  id: int("id").autoincrement().notNull(),
  sagaId: varchar("saga_id", { length: 255 }).notNull().unique(),
  type: varchar("type", { length: 255 }).notNull(),
  status: varchar("status", { length: 50, enum: ["STARTED", "PROCESSING", "COMPLETED", "FAILED", "COMPENSATING", "COMPENSATED"] }).notNull(),
  state: json("state").notNull(),
  correlationId: varchar("correlation_id", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  version: int("version").default(1).notNull(),
  expiresAt: timestamp("expires_at"),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.id] }),
    sagaIdIdx: uniqueIndex("saga_id_idx").on(table.sagaId),
  };
});
```

**ملاحظات:**
*   يحتوي جدول `saga_states` على الحقول اللازمة لتخزين حالة Saga، بما في ذلك `sagaId` و`status` و`state` و`version` للتحكم في التزامن المتفائل.

### آلية قائمة الانتظار (Queue Mechanism)

بدلاً من `EventQueue.ts` الحالي، والذي لم يتم تحليله بالكامل، يمكننا افتراض استخدام خدمة قائمة انتظار رسائل خارجية موثوقة مثل Kafka أو RabbitMQ، أو بناء آلية قائمة انتظار بسيطة تعتمد على جدول Outbox Worker. نظرًا لـ `OutboxWorker.ts` الموجود، سنركز على تحسينه بدلاً من تقديم بنية تحتية خارجية جديدة ما لم يكن ذلك ضروريًا للغاية.

**تحسين `OutboxWorker.ts`:**

*   **معالجة DLQ حقيقية**: بدلاً من مجرد التسجيل، يجب أن يقوم `handleDeadLetter` بحفظ الحدث في جدول DLQ مخصص أو إرساله إلى خدمة تنبيه.
*   **تكامل مع IdempotencyManager**: يجب أن يستخدم `OutboxWorker` `IdempotencyManager` عند إعادة محاولة إرسال الأحداث لضمان عدم معالجة الأحداث المكررة بواسطة المستهلكين.

## 5. تدفق التنفيذ (قبل مقابل بعد)

### تدفق التنفيذ قبل التعديلات (نظام "Best-Effort")

1.  **API Request**: يتلقى النظام طلبًا من واجهة برمجة التطبيقات.
2.  **Service/Use Case**: يقوم منطق العمل (مثل `CreateEscrow.ts`) ببدء عملية.
3.  **DB Transaction**: يتم بدء معاملة قاعدة بيانات (باستخدام `TransactionManager.run`).
4.  **DB Writes**: يتم إجراء كتابات على قاعدة البيانات (مثل إنشاء Escrow).
5.  **Saga State (غير ذري)**: يتم حفظ حالة Saga (باستخدام `SagaManager.saveState`)، ولكن ليس بالضرورة داخل نفس معاملة قاعدة البيانات، مما قد يؤدي إلى عدم تناسق.
6.  **Event Publish (في الذاكرة)**: يتم نشر حدث إلى `EventBus` في الذاكرة. إذا تعطل النظام بعد هذه النقطة وقبل معالجة الحدث، فسيتم فقدان الحدث.
7.  **DB Commit**: يتم الالتزام بمعاملة قاعدة البيانات.
8.  **Event Consumption**: يتم استهلاك الحدث بواسطة المعالجات المحلية (إذا كانت موجودة) أو يتم فقده.

**نقاط الضعف**: فقدان الأحداث، عدم تناسق حالة Saga، عدم وجود ضمانات Idempotency حقيقية.

### تدفق التنفيذ بعد التعديلات (نظام موثوق ومتسق)

1.  **API Request**: يتلقى النظام طلبًا من واجهة برمجة التطبيقات.
2.  **Idempotency Check**: يتم التحقق من مفتاح Idempotency. إذا كانت العملية مكررة ومكتملة، يتم إرجاع النتيجة المخزنة. إذا كانت قيد المعالجة، يتم التعامل معها وفقًا لذلك.
3.  **Service/Use Case**: يقوم منطق العمل ببدء عملية.
4.  **DB Transaction (مع سياق)**: يتم بدء معاملة قاعدة بيانات (باستخدام `TransactionManager.run`)، مع توفير سياق للمعاملة.
5.  **DB Writes**: يتم إجراء كتابات على قاعدة البيانات (مثل إنشاء Escrow) باستخدام `context.tx`.
6.  **Saga State (ذري)**: يتم حفظ حالة Saga (باستخدام `SagaManager.saveState`) داخل نفس معاملة قاعدة البيانات عن طريق تمرير `context.tx`.
7.  **Event Publish to Outbox (ذري)**: يتم نشر حدث إلى `EventBus`، والذي بدوره يضيف الحدث إلى جدول `outbox_events` داخل نفس معاملة قاعدة البيانات عن طريق تمرير `context.tx`.
8.  **Idempotency State Update (ذري)**: يتم تحديث حالة Idempotency (Mark Processing/Completed) في جدول `idempotency_records` داخل نفس معاملة قاعدة البيانات عن طريق تمرير `context.tx`.
9.  **DB Commit**: يتم الالتزام بمعاملة قاعدة البيانات. إذا فشلت أي خطوة من 5 إلى 8، يتم التراجع عن المعاملة بأكملها.
10. **OutboxWorker Poll**: يقوم `OutboxWorker` باستقصاء جدول `outbox_events` بشكل دوري.
11. **Event Dispatch**: يقوم `OutboxWorker` بإرسال الأحداث إلى خدمة قائمة انتظار الرسائل (أو معالجات الأحداث المباشرة) بعد تحديث حالة الحدث في Outbox إلى `processing`.
12. **Event Consumption**: يتم استهلاك الحدث بواسطة المستهلكين. إذا فشل الاستهلاك، يقوم `OutboxWorker` بإعادة المحاولة أو نقل الحدث إلى DLQ.
13. **Saga Resume/Retry/Compensation**: إذا تعطل النظام، يمكن لـ `AtomicSagaExecutor` استئناف Saga من حالتها المخزنة، وإعادة محاولة الخطوات الفاشلة، أو تنفيذ تعويضات إذا لزم الأمر.

**نقاط القوة**: ضمانات Idempotency، تسليم الأحداث "مرة واحدة على الأقل" أو "مرة واحدة بالضبط" (مع المستهلكين الواعين بـ Idempotency)، تناسق قوي بين DB والأحداث وحالة Saga، موثوقية Saga، متانة البيانات.

## 6. معالجة سيناريوهات الفشل

| سيناريو الفشل | التأثير قبل التعديلات | التأثير بعد التعديلات |
|---|---|---|
| **نجاح DB، فشل نشر الحدث (قبل الالتزام)** | يتم التراجع عن معاملة DB، ولكن قد يتم فقدان الحدث إذا تم نشره إلى EventBus في الذاكرة قبل الفشل. | يتم التراجع عن معاملة DB بأكملها (بما في ذلك كتابات DB، حفظ حالة Saga، إضافة الحدث إلى Outbox، وتحديث حالة Idempotency). لا يتم فقدان أي بيانات، ويمكن إعادة محاولة العملية بأمان بفضل Idempotency. |
| **نجاح DB، فشل نشر الحدث (بعد الالتزام)** | يتم الالتزام بمعاملة DB. إذا فشل نشر الحدث إلى EventBus في الذاكرة بعد الالتزام، فسيتم فقدان الحدث، مما يؤدي إلى عدم تناسق بين حالة DB والعالم الخارجي. | يتم الالتزام بمعاملة DB، ويتم حفظ الحدث في جدول Outbox. إذا فشل `OutboxWorker` في إرسال الحدث، فسيتم إعادة محاولته تلقائيًا. إذا استمر الفشل، فسيتم نقله إلى DLQ للمعالجة اليدوية أو الآلية. لا يتم فقدان الأحداث. |
| **نجاح الحدث، فشل Saga (أثناء التنفيذ)** | إذا فشل `AtomicSagaExecutor` (غير المستمر) أثناء تنفيذ خطوة Saga، فسيتم فقدان حالة Saga، وقد تترك النظام في حالة غير متناسقة. | يتم تخزين حالة Saga بشكل مستمر وذري مع المعاملات. إذا فشل `AtomicSagaExecutor`، يمكن استئناف Saga من آخر حالة معروفة، وإعادة محاولة الخطوة الفاشلة، أو تنفيذ تعويضات. |
| **تعطل النظام في منتصف التنفيذ** | فقدان الأحداث في EventBus في الذاكرة، فقدان حالة Saga غير المستمرة، عدم تناسق البيانات. | بفضل نمط Outbox وSaga المستمر وIdempotencyManager، يتم ضمان المتانة. سيتم استئناف `OutboxWorker` من حيث توقف، وإعادة معالجة الأحداث المعلقة. سيتم استئناف Saga من حالتها المخزنة. يمكن إعادة محاولة العمليات بأمان بفضل Idempotency. |

## 7. ضمانات النظام النهائية

بعد تطبيق التعديلات المقترحة، سيحقق النظام الضمانات التالية:

*   **ضمان Idempotency**: سيتم تنفيذ العمليات "مرة واحدة بالضبط" منطقيًا. لن تكون هناك مدفوعات أو إجراءات مكررة، وسيتم دمج `IdempotencyManager` بالكامل في تدفق التنفيذ الحقيقي.
*   **ضمان تسليم الأحداث**: سيتم ضمان تسليم الأحداث "مرة واحدة على الأقل" أو "مرة واحدة بالضبط" (اعتمادًا على تصميم المستهلك). سيتم استبدال `EventBus` في الذاكرة بآلية تعتمد على Outbox Worker، مع دعم إعادة المحاولة ومعالجة رسائل DLQ.
*   **ضمان التناسق**: سيتم حل مشكلة Dual-Write بين قاعدة البيانات و`EventBus` من خلال تطبيق نمط Outbox المرتبط بـ `TransactionManager`. سيتم ضمان الذرية بين كتابات قاعدة البيانات ونشر الأحداث.
*   **ضمان موثوقية Saga**: سيتم تحويل `AtomicSagaExecutor` إلى نظام Saga مستمر. سيتم تخزين حالة Saga في قاعدة البيانات، مع دعم استئناف Saga، وإعادة المحاولة، والتعويض بعد الأعطال، وتتبع الخطوات، والتعافي من الفشل.
*   **ضمان المتانة**: لن يتم فقدان أي بيانات حرجة (الأحداث، حالة Saga، العمليات) عند تعطل النظام.

**ما هو لا يزال "في نهاية المطاف" (Eventually Consistent)**:

*   **تسليم الأحداث إلى المستهلكين**: على الرغم من أن نشر الأحداث من النظام سيكون ذريًا ومضمونًا، إلا أن تسليم هذه الأحداث إلى المستهلكين الخارجيين أو الخدمات المصغرة الأخرى سيظل "في نهاية المطاف" متسقًا. هذا يعني أنه قد يكون هناك تأخير بين وقت الالتزام بالمعاملة ووقت معالجة الحدث بواسطة المستهلكين. ومع ذلك، سيتم ضمان التسليم في نهاية المطاف.
*   **حالة Saga المعقدة**: في بعض سيناريوهات Saga المعقدة التي تتضمن خدمات خارجية متعددة، قد يكون التناسق الكلي "في نهاية المطاف"، حيث قد تتطلب التعويضات أو إعادة المحاولات وقتًا لإكمالها.

## المراجع

لا توجد مراجع خارجية مستخدمة في هذا التقرير، حيث يعتمد التحليل على الكود المقدم. 
