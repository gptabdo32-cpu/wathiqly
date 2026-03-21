# تقرير الانتهاكات المعمارية - مشروع وثّقلي (Wathiqly)

تم إجراء تحليل شامل للكود المصدري الحالي للمشروع، وتم تحديد الانتهاكات التالية بناءً على مبادئ الهندسة النظيفة (Clean Architecture) والمتطلبات المحددة:

## 1. انتهاكات طبقة التطبيق (Application Layer Violations)
*   **ملف `CreateEscrow.ts`**:
    *   يستدعي `getDb()` مباشرة للوصول إلى قاعدة البيانات.
    *   يستخدم `db.select()` و `db.insert()` مباشرة بدلاً من استخدام المستودعات (Repositories).
    *   يحتوي على منطق استعلامات (SQL logic) داخل الـ Use Case.
    *   يستخدم `parseFloat` للتحقق من الرصيد، وهو منطق عمل (Business Logic) يجب أن يكون في طبقة الـ Domain.

## 2. كسر الاتساق المعاملاتي (Broken Transactional Consistency)
*   **ملف `CreateEscrow.ts`**:
    *   يتم إدراج حدث الـ Outbox (`outboxEvents`) خارج نطاق المعاملة المالية (`TransactionManager.run`).
    *   يتم نشر الحدث عبر الـ Queue (`publishToQueue`) مباشرة بعد المعاملة، مما قد يؤدي إلى فقدان الأحداث إذا فشل النظام قبل النشر.
*   **ملف `LedgerService.ts`**:
    *   يفتح معاملة داخلية (`db.transaction`) مما يجعل من المستحيل دمجه في معاملة أكبر (Nested Transaction issue).
    *   يحدث حالة الـ Idempotency خارج المعاملة في بعض الحالات.

## 3. غياب طبقة الـ Domain (Domain Layer Neglect)
*   **الوضع الحالي**: توجد مجلدات `domain` ولكنها تحتوي غالباً على واجهات (Interfaces) فقط.
*   **المشكلة**: منطق التحقق من صحة العقود، وتغيير حالات الضمان (Escrow Status)، وقواعد العمل المالية موجودة داخل الـ Use Cases أو الـ Services بدلاً من الكيانات (Entities).

## 4. تسريب المنطق المالي (Financial Logic Leakage)
*   **المشكلة**: الـ Use Cases تعرف تفاصيل حسابات الأستاذ العام (Ledger Accounts) مثل `buyerLedgerAccountId` وتحدد الـ `debit` والـ `credit` يدوياً.
*   **الحل**: يجب تجريد هذه العمليات خلف `PaymentService` أو `AccountingService` تتعامل مع المفاهيم المالية بدلاً من القيود المحاسبية المباشرة.

## 5. بقايا الأنظمة القديمة (Legacy Engine System)
*   **ملفات مستهدفة**: `smartEscrow.ts`, `EscrowEngine.ts`.
*   **المشكلة**: تحتوي على منطق متداخل مع الـ Use Cases الجديدة وتستخدم استدعاءات مباشرة لقاعدة البيانات (`getEscrowById`, `updateEscrowStatus`).

## 6. نظام الأحداث غير الحتمي (Non-deterministic Event System)
*   **المشكلة**: الاعتماد على `publishToQueue` و `eventBus.publish` المباشر بدلاً من الالتزام بنمط الـ Outbox لضمان التوصيل (Guaranteed Delivery).

---
**الخطوة القادمة**: البدء في إعادة هيكلة وحدة `Escrow` (المرحلة الثانية).
