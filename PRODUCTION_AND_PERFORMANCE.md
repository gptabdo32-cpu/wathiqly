# هيكلة الكود والإنتاجية (Production-Ready Structure & Performance)

يوضح هذا المستند كيفية تنظيم الكود داخل كل خدمة لضمان قابلية الصيانة والأداء العالي.

## 1. هيكل المجلدات الموحد (Standard Service Structure)

كل خدمة في `src/services/` تتبع الهيكل التالي:

```text
service/
├── domain/         # كيانات الدومين (Entities)، القواعد (Rules)، الواجهات (Interfaces)
├── application/    # حالات الاستخدام (Use Cases)، الأوركسترا (Orchestration)
├── infrastructure/ # تنفيذ المستودعات (Repositories)، المحولات (Adapters)
├── interfaces/     # نقاط دخول الـ API (Controllers)، تعريفات tRPC
├── events/         # معالجات الأحداث (Event Handlers)، تعريفات الأحداث
└── tests/          # اختبارات الوحدة واختبارات التكامل
```

## 2. استراتيجية الأداء (Performance Strategy)

### أ. التخزين المؤقت (Caching)
- استخدام Redis لتخزين نتائج الاستعلامات المتكررة (مثل بيانات المستخدم النشط).
- تفعيل **Cache-Aside Pattern** لضمان تحديث البيانات عند تغييرها.

### ب. العمليات غير المتزامنة (Asynchronous Workflows)
- تحويل جميع العمليات الثقيلة (مثل إرسال البريد، تحديث الـ Blockchain) إلى مهام خلفية (Background Jobs) باستخدام الـ Outbox Pattern.

### ج. تحسين قاعدة البيانات (Database Optimization)
- إعداد فهارس (Indexes) مناسبة لجميع أعمدة البحث المتكررة.
- استخدام **Read Replicas** لتوزيع أحمال القراءة في المستقبل.

---

## 3. معايير جودة الكود (Code Quality Standards)

- **Clean Code:** كل دالة تقوم بمهمة واحدة فقط.
- **SOLID Principles:** الالتزام بفصل المسؤوليات والاعتماد على الواجهات بدلاً من التنفيذ المباشر.
- **Error Handling:** استخدام أخطاء مخصصة (Custom Errors) لكل خدمة لسهولة التتبع.
- **Testing:** تغطية حالات الاستخدام (Use Cases) باختبارات آلية تضمن عدم تراجع الأداء أو الوظائف.
