# خريطة حدود الخدمات (Service Boundary Map) - مشروع واثقلي

بناءً على تحليل الكود الحالي، تم تحديد الوضع الراهن والخطوات اللازمة للتحول إلى معمارية موزعة (Distributed Modular Monolith) قابلة للتطور إلى Microservices.

## 1. تحليل النظام الحالي (System Analysis)

### الأجزاء التي يجب أن تبقى في النواة (Core Monolith)
- **Identity Service (Auth):** لإدارة الجلسات والتحقق من الهوية بشكل مركزي في البداية لضمان تجربة مستخدم سلسة.
- **Event Bus & Outbox Manager:** المحرك الذي يربط الخدمات ببعضها بشكل غير متزامن.

### الأجزاء التي يجب أن تصبح خدمات مستقلة (Independent Services)
- **Escrow Service:** محرك الضمان المالي.
- **Payment & Ledger Service:** إدارة المحافظ والسجلات المالية (Double-entry ledger).
- **Dispute Service:** إدارة النزاعات والتحكيم.
- **Notification Service:** إرسال التنبيهات عبر قنوات متعددة.
- **Blockchain Integration Service:** التعامل مع العقود الذكية والشبكات الخارجية.

### نقاط الاختناق والترابط (Bottlenecks & Coupling)
- **Tightly Coupled:** هناك ترابط قوي بين `Escrow` و `Payment` في طبقة الـ Infrastructure. يجب فصلهما عبر الأحداث (Events).
- **Performance Bottlenecks:** عمليات الـ Blockchain المتزامنة قد تعطل استجابة النظام. يجب تحويلها بالكامل إلى Outbox Pattern.
- **Database Boundaries:** حالياً جميع الجداول في قاعدة بيانات واحدة. سنقوم بتقسيمها منطقياً (Logical Separation) تمهيداً للفصل الفيزيائي.

---

## 2. خريطة حدود الخدمات (Service Boundary Map)

| الخدمة | المسؤولية | قاعدة البيانات (المنطقية) | الأحداث الصادرة |
| :--- | :--- | :--- | :--- |
| **Identity (Auth)** | إدارة المستخدمين، KYC، الأدوار | `users`, `sessions` | `UserCreated`, `KycVerified` |
| **Escrow** | دورة حياة الضمان، الشروط، المعالم | `escrows`, `milestones` | `EscrowCreated`, `FundsLocked` |
| **Payment** | المحافظ، السجل المالي، الإيداع/السحب | `wallets`, `ledger_entries` | `PaymentCompleted`, `RefundIssued` |
| **Dispute** | فتح النزاعات، الأدلة، التحكيم | `disputes`, `evidence` | `DisputeOpened`, `DisputeResolved` |
| **Blockchain** | المزامنة مع العقود الذكية، الـ Minting | `blockchain_txs` | `TxConfirmed`, `TxFailed` |
| **Notification** | إرسال البريد، الرسائل، الإشعارات | `notification_logs` | - |

---

## 3. خطة التحول المعماري (Refactoring Plan)

### الخطوة الأولى: الهيكلة (Step 1+2)
- إعادة تنظيم المجلدات لتتبع نمط `src/services/[service-name]`.
- داخل كل خدمة نطبق: `domain`, `application`, `infrastructure`, `interfaces`.

### الخطوة الثانية: الأحداث (Step 3)
- استبدال الاستدعاءات المباشرة بين `Escrow` و `Payment` بنظام `Publish/Subscribe`.
- تفعيل الـ `Outbox Pattern` بشكل صارم لضمان الاتساق النهائي (Eventual Consistency).

### الخطوة الثالثة: الأمان والجهوزية للسحاب (Step 4+5)
- تحويل الخدمات لتكون `Stateless`.
- تنفيذ `Zero-Trust` في التواصل بين الخدمات.

---

## 4. تقييم القابلية للتوسع (Scalability Evaluation)
**الدرجة الحالية: 4/10**
- **السبب:** وجود ترابط قوي، استخدام ذاكرة عشوائية لبعض العمليات الأمنية، عدم اكتمال فصل البيانات.

**الدرجة المستهدفة: 9/10**
- **الخطة:** فصل الخدمات، استخدام Message Queue (Redis/RabbitMQ)، توزيع قواعد البيانات.
