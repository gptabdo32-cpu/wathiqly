# تقرير تحليل الانتهاكات المعمارية وخطة الإصلاح لمشروع Wathiqly

**المؤلف:** Manus AI
**التاريخ:** 21 مارس 2026

## 1. المقدمة

يهدف هذا التقرير إلى تحليل البنية المعمارية الحالية لمشروع Wathiqly، وتحديد الانتهاكات الرئيسية لمبادئ Clean Architecture، وتقديم خطة عمل مفصلة لإصلاح هذه الانتهاكات. يركز التحليل على تحويل النظام إلى بنية مالية جاهزة للإنتاج، مع الالتزام الصارم بعدم إعادة كتابة النظام بالكامل أو تغيير سلوك الأعمال الأساسي.

## 2. ملخص الوضع الحالي

لقد تم إحراز تقدم كبير في تطبيق المعمارية النظيفة، حيث تم بالفعل فصل بعض الطبقات وتحويل بعض المكونات القديمة إلى واجهات (Facades) رفيعة. ومع ذلك، لا تزال هناك نقاط حرجة تتطلب المعالجة لضمان الفصل الصارم للطبقات، والتناسق المالي، وموثوقية الأحداث.

## 3. الانتهاكات المعمارية المكتشفة وخطة الإصلاح

تم تحديد الانتهاكات التالية بناءً على تحليل الكود الحالي، مع الإشارة إلى المشاكل المحددة والإجراءات المقترحة:

### 3.1. انتهاك طبقة التطبيق (Application Layer Violation) وتسرب منطق المحاسبة المالية (Ledger Logic Leakage)

**المشكلة:**
تصل الـ UseCases (مثل `CreateEscrow`) بشكل مباشر إلى `LedgerService` وتقوم ببناء تفاصيل إدخالات دفتر الأستاذ (ledger entries) بشكل صريح [1]. هذا ينتهك مبدأ أن طبقة التطبيق يجب أن تعتمد فقط على الواجهات، ولا يجب أن تحتوي على منطق عمل مالي مفصل أو معرفة ببنية دفتر الأستاذ الداخلية.

**مثال (من `CreateEscrow.ts`):**
```typescript
      // 5. Ledger: Move funds
      await this.ledgerService.recordTransaction({
        description: `Locking funds for Escrow #${escrowId}`,
        referenceType: "escrow",
        referenceId: escrowId,
        escrowContractId: escrowId,
        idempotencyKey: `escrow_lock_${escrowId}`,
        entries: [
          { accountId: 1, debit: "0.0000", credit: params.amount }, // Simplified account lookup
          { accountId: escrowAccountId, debit: params.amount, credit: "0.0000" },
        ],
      }, tx);
```

**خطة الإصلاح:**
1.  **إنشاء واجهة `IPaymentService`:** سيتم تعريف واجهة جديدة في طبقة المجال (Domain) أو طبقة التطبيق (Application) لتجريد عمليات الدفع الرئيسية (مثل قفل الأموال، تحرير الأموال، رد الأموال).
2.  **تطبيق `PaymentService`:** سيتم إنشاء تطبيق لهذه الواجهة في طبقة البنية التحتية (Infrastructure)، والذي سيحتوي على المنطق التفصيلي لإنشاء إدخالات دفتر الأستاذ والتفاعل مع `LedgerService`.
3.  **تعديل الـ UseCases:** ستعتمد الـ UseCases على `IPaymentService` وتستدعي طرقًا عالية المستوى (مثل `lockEscrowFunds`) بدلاً من بناء إدخالات دفتر الأستاذ مباشرة.

### 3.2. عدم موثوقية نظام الأحداث (Non-Deterministic Event System)

**المشكلة:**
يقوم `BlockchainOrchestrator` بنشر الأحداث مباشرة عبر `eventBus.publish` بعد معالجة حدث من الـ Outbox [2]. هذا ينتهك مبدأ أن الأحداث يجب أن تنشأ فقط من الـ Outbox لضمان الذرية والموثوقية (Outbox Pattern). يجب أن يكون الـ Outbox هو المصدر الوحيد للأحداث التي يتم نشرها خارجياً.

**مثال (من `BlockchainOrchestrator.ts`):**
```typescript
          // Dispatch internal event for UI/Notifications
          await eventBus.publish(EventType.ESCROW_FUNDS_LOCKED, payload);
```

**خطة الإصلاح:**
1.  **إزالة النشر المباشر للأحداث:** سيتم إزالة جميع استدعاءات `eventBus.publish` المباشرة من `BlockchainOrchestrator`.
2.  **الاعتماد الكلي على Outbox Worker:** يجب أن يكون `OutboxWorker` هو المسؤول الوحيد عن قراءة الأحداث من جدول الـ Outbox ونشرها، مما يضمن أن جميع الأحداث تمر عبر آلية الـ Outbox الموثوقة.

### 3.3. تسرب منطق الأعمال إلى طبقة التطبيق (Business Logic Leakage to Application Layer)

**المشكلة:**
على الرغم من وجود بعض قواعد الأعمال في `Escrow.ts`، لا تزال الـ UseCases تتخذ بعض القرارات المتعلقة بمنطق الأعمال، مثل تحديد `blockchainStatus` بناءً على وجود `sellerWalletAddress` [1]. يجب أن تكون الـ UseCases مجرد منسقات (coordinators) تستدعي وظائف المجال (Domain functions) ولا تحتوي على منطق أعمال خاص بها.

**مثال (من `CreateEscrow.ts`):**
```typescript
    const escrow = Escrow.create({
      buyerId: params.buyerId,
      sellerId: params.sellerId,
      amount: params.amount,
      description: params.description,
      blockchainStatus: params.sellerWalletAddress ? "pending" : "none",
    });
```

**خطة الإصلاح:**
1.  **نقل منطق `blockchainStatus`:** يجب نقل قرار تحديد `blockchainStatus` إلى طبقة المجال (Domain) أو إلى خدمة مجال (Domain Service) إذا كان يتطلب تفاعلات معقدة، بحيث يتم تغليفه كقاعدة عمل.
2.  **تعزيز كيانات المجال:** التأكد من أن كيانات المجال (Domain Entities) وخدمات المجال (Domain Services) تحتوي على جميع قواعد الأعمال والتحقق من الصحة المتعلقة بها.

### 3.4. منطق DB مباشر في `LedgerService` (Direct DB Logic in LedgerService)

**المشكلة:**
يحتوي `LedgerService` على منطق DB مباشر ومعقد، بما في ذلك استعلامات `SELECT` و `INSERT` و `UPDATE`، بالإضافة إلى إدارة ذاكرة التخزين المؤقت (cache) [3]. على الرغم من أن `LedgerService` هو جزء من طبقة البنية التحتية، إلا أن وجود هذا المستوى من التفاصيل في خدمة واحدة يمكن أن يجعلها أقل قابلية للاختبار وأكثر صعوبة في الصيانة. كما أن منطق التحقق من إدخالات القيد المزدوج (Double-Entry validation) موجود داخل هذه الخدمة.

**مثال (من `LedgerService.ts`):**
```typescript
    const [cachedBalance] = await db
      .select()
      .from(accountBalancesCache)
      .where(eq(accountBalancesCache.accountId, accountId));

    // ...

    // 1. Validate Double-Entry
    const totalDebit = params.entries.reduce((sum: any, e: any) => sum + parseFloat(e.debit), 0);
    const totalCredit = params.entries.reduce((sum: any, e: any) => sum + parseFloat(e.credit), 0);
```

**خطة الإصلاح:**
1.  **فصل Repositories:** يجب فصل منطق الوصول إلى البيانات (Data Access Logic) إلى Repositories مخصصة (مثل `ILedgerAccountRepository`, `ILedgerTransactionRepository`, `ILedgerEntryRepository`)، بحيث يكون `LedgerService` مسؤولاً فقط عن تنسيق هذه Repositories وتطبيق منطق المحاسبة عالي المستوى.
2.  **نقل التحقق من القيد المزدوج:** يمكن نقل منطق التحقق من القيد المزدوج إلى كائن قيمة (Value Object) أو خدمة مجال (Domain Service) لضمان إمكانية إعادة الاستخدام والاختبار بشكل أفضل.

### 3.5. Legacy Engines كـ Facades (Legacy Engines as Facades)

**المشكلة:**
تم تحويل ملفات مثل `EscrowEngine.ts` و `PaymentOrchestrator.ts` بنجاح إلى واجهات (Facades) رفيعة تقوم بتفويض المهام إلى الـ UseCases [4]. هذا يتوافق مع المتطلبات.

**خطة الإصلاح:**
*   لا توجد إجراءات إضافية مطلوبة لهذه النقطة، حيث تم تنفيذ الإصلاح بالفعل.

## 4. خطة العمل التفصيلية (ترتيب التنفيذ)

لضمان التنفيذ التدريجي والحفاظ على وظائف النظام، سيتم اتباع خطة العمل التالية:

1.  **إصلاح طبقة Domain:** استخراج قواعد الأعمال المتبقية من UseCases إلى طبقة المجال أو خدمات المجال. (المرحلة 3 في الخطة الرئيسية)
2.  **إصلاح طبقة Application:** إنشاء `IPaymentService` وتطبيقه، ثم تعديل الـ UseCases للاعتماد عليه. (المرحلة 4 في الخطة الرئيسية)
3.  **إصلاح Outbox Pattern:** إزالة النشر المباشر للأحداث من `BlockchainOrchestrator`. (المرحلة 5 و 7 في الخطة الرئيسية)
4.  **تحسين `LedgerService`:** فصل Repositories داخل `LedgerService` ونقل منطق التحقق من القيد المزدوج. (جزء من المرحلة 4 في الخطة الرئيسية)
5.  **إضافة طبقة التحقق من المدخلات:** التأكد من وجود طبقة تحقق صارمة عند حدود API (تم إحراز تقدم في هذا، ولكن سيتم التحقق من الشمولية). (المرحلة 8 في الخطة الرئيسية)
6.  **التحقق النهائي:** إجراء مراجعة شاملة للتأكد من عدم وجود انتهاكات متبقية. (المرحلة 9 في الخطة الرئيسية)

## 5. المراجع

[1] `src/modules/escrow/application/use-cases/CreateEscrow.ts`
[2] `src/modules/blockchain/BlockchainOrchestrator.ts`
[3] `src/modules/blockchain/LedgerService.ts`
[4] `src/modules/escrow/EscrowEngine.ts`
