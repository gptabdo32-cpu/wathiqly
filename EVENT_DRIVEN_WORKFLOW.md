# تصميم سير العمل القائم على الأحداث (Event-Driven Workflow Design)

هذا المستند يوضح كيف يتم استبدال الاستدعاءات المباشرة بين الخدمات بالأحداث لضمان استقلالية الخدمات (Decoupling) وقابلية التوسع.

## 1. نمط صندوق الصادر (Outbox Pattern)
لضمان الاتساق بين قاعدة البيانات والأحداث الصادرة، نستخدم الـ Outbox Pattern:
1. تبدأ معاملة (Transaction) في قاعدة البيانات.
2. يتم تحديث بيانات الدومين (مثلاً: إنشاء Escrow).
3. يتم إدراج حدث في جدول `outbox_events` داخل نفس المعاملة.
4. تكتمل المعاملة (Commit).
5. يقوم `OutboxWorker` بقراءة الأحداث غير المعالجة ونشرها عبر الـ `EventBus`.

## 2. مثال: دورة حياة الضمان (Escrow Lifecycle)

### أ. إنشاء الضمان وحجز الأموال
1. **Escrow Service:** ينشئ الضمان ويحفظ حدث `EscrowCreated`.
2. **OutboxWorker:** ينشر `EscrowCreated`.
3. **Payment Service:** يستمع لـ `EscrowCreated` ويقوم بحجز الأموال (Lock Funds).
4. **Payment Service:** يحفظ حدث `FundsLocked`.
5. **Escrow Service:** يستمع لـ `FundsLocked` ويحدث حالة الضمان إلى `FUNDED`.

### ب. فتح نزاع (Dispute)
1. **Escrow Service:** يستقبل طلب نزاع، يحدث الحالة، ويحفظ `DisputeOpened`.
2. **Notification Service:** يستمع لـ `DisputeOpened` ويرسل تنبيهات للبائع والمشتري.
3. **Dispute Service:** يستمع لـ `DisputeOpened` لفتح ملف تحقيق جديد.

---

## 3. عقود الأحداث (Event Schema Contracts)

| الحدث | المصدر | البيانات الأساسية (Payload) |
| :--- | :--- | :--- |
| `EscrowCreated` | Escrow | `escrowId`, `buyerId`, `amount`, `currency` |
| `FundsLocked` | Payment | `escrowId`, `transactionId`, `amount` |
| `PaymentFailed` | Payment | `escrowId`, `reason`, `errorCode` |
| `DisputeOpened` | Escrow | `escrowId`, `initiatorId`, `reason` |
| `EscrowReleased` | Escrow | `escrowId`, `sellerId`, `amount` |

---

## 4. استراتيجية الفشل (Fault Tolerance)
- **Retry Strategy:** إعادة المحاولة 5 مرات بفاصل زمني متزايد (Exponential Backoff).
- **Dead-Letter Queue (DLQ):** نقل الأحداث التي فشلت نهائياً إلى جدول `failed_events` للتحليل اليدوي.
- **Idempotency:** كل مستهلك للأحداث (Consumer) يجب أن يتحقق من `eventId` لضمان عدم معالجة نفس الحدث مرتين.
