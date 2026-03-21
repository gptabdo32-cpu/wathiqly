# تقرير انتهاكات الهندسة المعمارية المحدث (Updated Architecture Violations Report)

بناءً على القواعد الصارمة الـ 20 المحددة، تم تحديث تحليل الانتهاكات في النظام الحالي:

| القاعدة | الانتهاك المحدد | الملف المتأثر | السبب / الملاحظة |
| :--- | :--- | :--- | :--- |
| **1. إزالة الأوركسترا المزدوجة** | استخدام `EscrowEngine` المفقود | `src/apps/api/routers.ts` | لا يزال يستورد ويستخدم `EscrowEngine` بدلاً من `Use Cases`. |
| **2. نقاء النطاق (Domain)** | وجود `_reconstitute` و `getProps` | `src/modules/escrow/domain/Escrow.ts` | النطاق يجب أن يكون 100% نقي وبدون أي وعي بالبنية التحتية. |
| **4. استبدال التبعيات بواجهات** | الاعتماد على فئات ملموسة | `src/core/di/container.ts` | الـ Container ينشئ `LedgerService` و `PaymentService` مباشرة. |
| **8. فرض نمط Outbox** | حفظ يدوي للأحداث | `src/modules/escrow/application/use-cases/CreateEscrow.ts` | يتم حفظ الأحداث يدوياً ولا يوجد Background Worker آلي. |
| **11. توحيد عقود الأحداث** | توليد عشوائي للمعرفات | `src/modules/escrow/application/use-cases/CreateEscrow.ts` | لا يتم استخدام مصنع أحداث موحد يضمن الالتزام بالعقود. |
| **13. تنفيذ EscrowSaga** | عدم استخدام الـ Saga | `src/apps/api/routers.ts` | التدفق الحالي لا يمر عبر `EscrowSaga` المنفذ جزئياً. |
| **16. إزالة fromPersistence** | وجود `_reconstitute` | `src/modules/escrow/domain/Escrow.ts` | يجب إزالة أي ميثود مخصصة لإعادة البناء من طبقة النطاق. |
| **19. فئات أخطاء صارمة** | استخدام `Error` العام | `src/core/db/TransactionManager.ts` | يتم رمي `Error` عام بدلاً من فئات أخطاء مخصصة وصارمة. |
| **20. العمليات غير المتزامنة** | تفاعلات بلوكشين متزامنة | `src/modules/escrow/infrastructure/PaymentService.ts` | العمليات المالية تتم بشكل متزامن داخل دورة حياة الطلب. |

---

### **الخطوات القادمة للإصلاح:**
1.  **حذف** `EscrowEngine` و `OrchestrationLayer` و `PaymentOrchestrator` (إن وجدت) وتوجيه كافة الطلبات عبر `EscrowSaga`.
2.  **تنقية** طبقة الـ Domain ونقل منطق الـ Mapping بالكامل إلى الـ Infrastructure.
3.  **تطبيق** Dependency Injection حقيقي باستخدام الواجهات في الـ Container.
4.  **بناء** Background Worker لمعالجة الـ Outbox مع دعم الـ Retry و DLQ.
5.  **تفعيل** الـ Saga Orchestration لضمان الاتساق المالي والتراجع عند الفشل.
