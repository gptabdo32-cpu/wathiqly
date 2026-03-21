# تقرير انتهاكات الهيكلية وخطة التحسين (Wathiqly)

## 1. قائمة الانتهاكات المحددة (Violations)

| الملف | الانتهاك | السبب |
| :--- | :--- | :--- |
| `src/modules/escrow/EscrowEngine.ts` | **Dual Orchestration Layer** | يعمل كـ Facade مكرر فوق Use Cases. |
| `src/modules/escrow/OrchestrationLayer.ts` | **Dual Orchestration Layer** | طبقة إضافية غير ضرورية تكسر Clean Architecture. |
| `src/modules/escrow/PaymentOrchestrator.ts` | **Dual Orchestration Layer** | تكرار لمنطق الـ Use Cases في طبقة Orchestration. |
| `src/modules/escrow/domain/Escrow.ts` | **Domain Purity Violation** | وجود `fromPersistence` داخل الـ Domain Entity. |
| `src/modules/escrow/EscrowEngine.ts` | **Direct Instantiation** | استخدام `new Service()` داخل الكلاس (خرق DI). |
| `src/modules/escrow/infrastructure/DrizzleEscrowRepository.ts` | **Mapping Responsibility** | الـ Repository يعتمد على `fromPersistence` الموجود في الـ Domain. |
| `src/modules/blockchain/OutboxWorker.ts` | **Incomplete Outbox Pattern** | غياب Idempotency، Dead-letter queue، و Schema validation. |
| `src/modules/escrow/application/use-cases/CreateEscrow.ts` | **Direct Dependency** | الاعتماد على `TransactionManager` بشكل مباشر بدلاً من Interface (اختياري ولكن يفضل التجريد). |

## 2. خطوات إعادة الهيكلة (Refactoring Steps)

1. **Phase 1: Orchestration Cleanup**
   - حذف `EscrowEngine.ts`, `OrchestrationLayer.ts`, `PaymentOrchestrator.ts`.
   - توجيه الـ API Routers للتعامل مباشرة مع الـ Use Cases.

2. **Phase 2: Domain Purity & Mapping**
   - إزالة `fromPersistence` من `Escrow.ts`.
   - إنشاء `EscrowMapper` في الـ Infrastructure للتحويل بين DB و Domain.

3. **Phase 3: Dependency Injection (DI)**
   - تعديل الـ Use Cases لاستقبال التبعيات عبر الـ Constructor فقط.
   - إعداد Container بسيط أو Factory لإدارة الـ Dependencies.

4. **Phase 4: Outbox & Event System Upgrade**
   - تحديث جدول الـ Outbox ليشمل `eventId`, `version`, `idempotencyKey`.
   - تنفيذ Background Worker متطور مع DLQ و Retry logic.
   - إنشاء `src/contracts/events/` لتوحيد العقود.

5. **Phase 5: Saga Implementation**
   - تنفيذ `EscrowSaga` لإدارة التدفق المالي المعقد (Create -> Lock -> Emit -> Confirm/Rollback).

6. **Phase 6: Security & Performance**
   - إضافة Zod validation في طبقة الـ Application.
   - نقل عمليات الـ Blockchain إلى Async Workers بالكامل.

---
**النتيجة المستهدفة:** نظام موزع بمعايير Fintech، قابل للتوسع، وضمان تناسق البيانات (Eventual Consistency) عبر Saga و Outbox.
