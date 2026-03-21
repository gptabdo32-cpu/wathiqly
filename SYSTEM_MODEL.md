# نموذج النظام المالي الحتمي (Deterministic Financial System Model)

بناءً على مبادئ "Distributed Systems Control Architect"، تم إعادة تصميم تدفقات النظام (Escrow, Payment, Dispute) كآلة حالة (State Machine) مدفوعة بالأحداث.

## 1. تدفق الضمان (Escrow Flow)

| الحالة الحالية (STATE) | الحدث (EVENT) | الحالة التالية (NEXT STATE) | الوصف |
| :--- | :--- | :--- | :--- |
| `NONE` | `EscrowRequested` | `PENDING_INITIALIZATION` | تم طلب إنشاء ضمان جديد |
| `PENDING_INITIALIZATION` | `EscrowInitialized` | `FUNDS_LOCK_PENDING` | تم تسجيل الضمان في قاعدة البيانات |
| `FUNDS_LOCK_PENDING` | `FundsLocked` | `ACTIVE` | تم حجز الأموال بنجاح في نظام الدفع |
| `FUNDS_LOCK_PENDING` | `FundsLockFailed` | `FAILED` | فشل حجز الأموال (يتطلب تعويض) |
| `ACTIVE` | `ReleaseRequested` | `RELEASE_PENDING` | طلب البائع/المشتري تحرير الأموال |
| `RELEASE_PENDING` | `FundsReleased` | `COMPLETED` | تم تحويل الأموال للبائع |
| `ACTIVE` | `DisputeRaised` | `DISPUTED` | تم فتح نزاع على الضمان |
| `DISPUTED` | `RefundApproved` | `REFUND_PENDING` | تمت الموافقة على استرداد الأموال |
| `REFUND_PENDING` | `FundsRefunded` | `REFUNDED` | تم إعادة الأموال للمشتري |

## 2. تدفق الدفع (Payment Flow)

| الحالة الحالية (STATE) | الحدث (EVENT) | الحالة التالية (NEXT STATE) | الوصف |
| :--- | :--- | :--- | :--- |
| `NONE` | `PaymentInitiated` | `VALIDATING` | بدء عملية الدفع |
| `VALIDATING` | `ValidationPassed` | `PROCESSING` | التحقق من الرصيد والصلاحية |
| `PROCESSING` | `TransactionCommitted` | `SUCCESS` | اكتمال المعاملة المالية |
| `PROCESSING` | `TransactionFailed` | `FAILED` | فشل المعاملة (يتطلب تراجع) |

## 3. سيناريوهات الفشل المحددة (Identified Failure Scenarios)

1. **فشل الشبكة أثناء حجز الأموال**: قد يتم حجز الأموال في نظام الدفع ولكن لا يصل التأكيد لنظام الضمان.
   - *الحل*: استخدام `Idempotency Key` و `Outbox Pattern`.
2. **تكرار الأحداث (Duplicate Events)**: استلام حدث `FundsLocked` مرتين.
   - *الحل*: معالجة الأحداث بشكل حتمي (Idempotent Consumers).
3. **عدم ترتيب الأحداث (Out-of-order Events)**: استلام حدث `ReleaseRequested` قبل `FundsLocked`.
   - *الحل*: رفض الانتقالات غير المنطقية في آلة الحالة.

## 4. مبادئ التصميم المطبقة

- **الحتمية (Determinism)**: كل انتقال للحالة يعتمد فقط على الحالة الحالية والحدث الوارد.
- **إمكانية إعادة التشغيل (Replayability)**: يمكن إعادة بناء الحالة النهائية من خلال إعادة تشغيل سجل الأحداث.
- **العزل (Isolation)**: حدود واضحة بين ACID (داخل الخدمة) والاتساق النهائي (عبر الخدمات).
