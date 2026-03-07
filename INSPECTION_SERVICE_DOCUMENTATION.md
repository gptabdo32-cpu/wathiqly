# توثيق ميزة خدمة المعاينة الميدانية الموثقة

## نظرة عامة

**خدمة المعاينة الميدانية الموثقة** (Verified Inspection Service) هي ميزة متقدمة تحل أكبر مشكلة في تجارة السلع المستعملة عبر الإنترنت: **الخوف من العيوب الخفية**.

### المشكلة التي تحلها
عند شراء سلعة مستعملة (خاصة الهواتف والسيارات)، يخاف المشتري من:
- العيوب الخفية التي لا تظهر في الصور
- الأعطال الداخلية
- عدم توافق المواصفات الفعلية مع الوصف

### الحل
توفير **فاحص معتمد مستقل** يقوم بـ:
1. فحص شامل للسلعة
2. تصوير موثق من عدة زوايا
3. كتابة تقرير مفصل عن الحالة
4. تقديم درجة تقييم موضوعية

---

## آلية العمل

### المرحلة 1: طلب المعاينة (المشتري)

```
المشتري يفتح صفقة escrow
        ↓
يختار خيار "طلب معاينة ميدانية"
        ↓
يحدد نوع السلعة (اختياري)
        ↓
يؤكد الطلب ويدفع رسوم المعاينة (20 د.ل)
```

**الخطوات التقنية:**
```typescript
// 1. المشتري يستدعي API
trpc.inspectionService.requestInspection.mutate({
  escrowId: 123,
  specialtyRequired: "electronics"
});

// 2. النظام يقوم بـ:
// - التحقق من أن المشتري هو الذي طلب المعاينة
// - التحقق من عدم وجود معاينة سابقة
// - اختيار فاحص معتمد متاح
// - إنشاء سجل معاينة جديد
// - حجز رسوم المعاينة من محفظة المشتري
```

### المرحلة 2: الفحص والتقرير (الفاحص)

```
الفاحص يستقبل إشعار بطلب معاينة
        ↓
يذهب لمكان السلعة ويقوم بالفحص
        ↓
يلتقط صور موثقة من عدة زوايا
        ↓
يملأ نموذج التقرير:
  - ملخص الحالة
  - درجة التقييم (1-10)
  - الحالة الخارجية
  - الحالة الداخلية
  - الحالة الوظيفية
  - العيوب المكتشفة
        ↓
يرفع التقرير والصور
```

**الخطوات التقنية:**
```typescript
// الفاحص يرفع التقرير
trpc.inspectionService.submitReport.mutate({
  reportId: 456,
  summary: "السلعة في حالة جيدة جداً...",
  conditionScore: 8,
  findings: {
    exterior: "الهيكل الخارجي نظيف وخالي من الخدوش",
    interior: "الشاشة نظيفة وبدون بقع",
    functional: "جميع الأزرار تعمل بشكل صحيح",
    defects: ["خدش صغير على الحافة اليسرى"]
  },
  mediaUrls: ["url1", "url2", "url3", ...]
});
```

### المرحلة 3: المراجعة والموافقة (المشتري)

```
المشتري يستقبل إشعار بإكمال التقرير
        ↓
يقرأ ملخص التقرير وينظر للصور
        ↓
يختار:
  أ) الموافقة على التقرير → يكمل الشراء
  ب) رفض التقرير → يطلب معاينة جديدة أو يلغي الصفقة
```

**الخطوات التقنية:**
```typescript
// إذا وافق المشتري
trpc.inspectionService.approveReport.mutate({
  reportId: 456
});

// إذا رفض المشتري
trpc.inspectionService.rejectReport.mutate({
  reportId: 456,
  reason: "الحالة أسوأ مما هو موصوف في الإعلان"
});
```

---

## هيكل قاعدة البيانات

### جدول `inspectionReports`

```sql
CREATE TABLE inspectionReports (
  id INT PRIMARY KEY AUTO_INCREMENT,
  
  -- العلاقات
  escrowId INT,                    -- الصفقة المرتبطة
  timedLinkId INT,                 -- الرابط الموقوت (اختياري)
  
  -- معلومات الفاحص
  inspectorId INT NOT NULL,        -- معرف الفاحص
  
  -- محتوى التقرير
  summary TEXT NOT NULL,           -- ملخص الحالة
  conditionScore INT DEFAULT 0,    -- درجة التقييم (1-10)
  findings JSON,                   -- الملاحظات التفصيلية
  mediaUrls JSON,                  -- روابط الصور
  
  -- التحقق
  isVerified BOOLEAN DEFAULT FALSE,
  verifiedAt TIMESTAMP,
  
  -- الحالة
  status ENUM(
    'pending',                     -- في الانتظار
    'completed',                   -- مكتمل
    'approved',                    -- موافق عليه
    'rejected'                     -- مرفوض
  ) DEFAULT 'pending',
  
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### جدول `inspectionAgents`

```sql
CREATE TABLE inspectionAgents (
  id INT PRIMARY KEY AUTO_INCREMENT,
  userId INT NOT NULL UNIQUE,      -- معرف المستخدم
  
  agentName VARCHAR(255) NOT NULL, -- اسم الفاحص
  location VARCHAR(255),           -- الموقع الجغرافي
  specialties JSON,                -- التخصصات (مثل: ["cars", "electronics"])
  
  isAvailable BOOLEAN DEFAULT TRUE,-- متاح للعمل
  rating DECIMAL(3,2) DEFAULT 0,   -- التقييم
  
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

---

## API Endpoints

### 1. طلب معاينة

**Endpoint:** `POST /trpc/inspectionService.requestInspection`

**الإدخال:**
```typescript
{
  escrowId: number,                // معرف الصفقة
  specialtyRequired?: string       // نوع السلعة (اختياري)
}
```

**الإخراج:**
```typescript
{
  success: boolean,
  reportId: number,
  assignedAgent: {
    id: number,
    name: string,
    location: string
  }
}
```

**الأخطاء المحتملة:**
- `NOT_FOUND`: الصفقة غير موجودة
- `FORBIDDEN`: المستخدم ليس مشتري الصفقة
- `BAD_REQUEST`: معاينة موجودة بالفعل أو لا توجد فاحصين متاحين

---

### 2. الحصول على التقرير

**Endpoint:** `GET /trpc/inspectionService.getReport`

**الإدخال:**
```typescript
{
  escrowId: number
}
```

**الإخراج:**
```typescript
{
  id: number,
  escrowId: number,
  inspectorId: number,
  summary: string,
  conditionScore: number,
  findings: {
    exterior?: string,
    interior?: string,
    functional?: string,
    defects?: string[]
  },
  mediaUrls: string[],
  status: "pending" | "completed" | "approved" | "rejected",
  inspector: {
    id: number,
    name: string,
    profileImage?: string
  }
}
```

---

### 3. رفع التقرير (الفاحص)

**Endpoint:** `POST /trpc/inspectionService.submitReport`

**الإدخال:**
```typescript
{
  reportId: number,
  summary: string,                 // على الأقل 10 أحرف
  conditionScore: number,          // 1-10
  findings: {
    exterior?: string,
    interior?: string,
    functional?: string,
    defects?: string[]
  },
  mediaUrls: string[]              // روابط صور
}
```

**الإخراج:**
```typescript
{
  success: boolean,
  message: string
}
```

---

### 4. الموافقة على التقرير

**Endpoint:** `POST /trpc/inspectionService.approveReport`

**الإدخال:**
```typescript
{
  reportId: number
}
```

**الإخراج:**
```typescript
{
  success: boolean,
  message: "Report approved. You can now proceed with payment."
}
```

---

### 5. رفض التقرير

**Endpoint:** `POST /trpc/inspectionService.rejectReport`

**الإدخال:**
```typescript
{
  reportId: number,
  reason: string                   // على الأقل 10 أحرف
}
```

**الإخراج:**
```typescript
{
  success: boolean,
  message: "Report rejected. A new inspection can be requested."
}
```

---

## مكونات React

### 1. RequestInspection

**الموقع:** `client/src/components/RequestInspection.tsx`

**الاستخدام:**
```tsx
import { RequestInspection } from "@/components/RequestInspection";

export function EscrowPage() {
  return (
    <RequestInspection 
      escrowId={123}
      onSuccess={() => console.log("Inspection requested")}
    />
  );
}
```

**الميزات:**
- عرض حالة المعاينة
- اختيار نوع السلعة
- تأكيد الطلب
- عرض الفاحص المعين

---

### 2. InspectorReportForm

**الموقع:** `client/src/components/InspectorReportForm.tsx`

**الاستخدام:**
```tsx
import { InspectorReportForm } from "@/components/InspectorReportForm";

export function InspectorDashboard() {
  return (
    <InspectorReportForm 
      reportId={456}
      onSuccess={() => console.log("Report submitted")}
    />
  );
}
```

**الميزات:**
- نموذج شامل للتقرير
- شريط تقييم الحالة
- إضافة العيوب
- رفع الصور
- التحقق من البيانات

---

### 3. InspectionReportViewer

**الموقع:** `client/src/components/InspectionReportViewer.tsx`

**الاستخدام:**
```tsx
import { InspectionReportViewer } from "@/components/InspectionReportViewer";

export function BuyerReviewPage() {
  return (
    <InspectionReportViewer 
      escrowId={123}
      onApprove={() => console.log("Approved")}
      onReject={() => console.log("Rejected")}
    />
  );
}
```

**الميزات:**
- عرض معلومات الفاحص
- عرض ملخص التقرير
- عرض درجة التقييم
- عرض الملاحظات التفصيلية
- عرض معرض الصور
- أزرار الموافقة/الرفض

---

## التكامل مع النظام الحالي

### تحديث `routers.ts`

```typescript
import { inspectionServiceRouter } from "./routers/inspectionService";

export const appRouter = router({
  // ... existing routers
  inspectionService: inspectionServiceRouter,
});
```

### تحديث `App.tsx`

```typescript
import { RequestInspection } from "@/components/RequestInspection";
import { InspectorReportForm } from "@/components/InspectorReportForm";
import { InspectionReportViewer } from "@/components/InspectionReportViewer";

export function App() {
  return (
    <Router>
      {/* ... existing routes */}
      
      {/* Inspection routes */}
      <Route path="/escrow/:id/inspection" component={RequestInspection} />
      <Route path="/inspector/report/:reportId" component={InspectorReportForm} />
      <Route path="/escrow/:id/review-inspection" component={InspectionReportViewer} />
    </Router>
  );
}
```

### تحديث نموذج الصفقة

```typescript
// في escrow router
export const escrowRouter = router({
  // ... existing endpoints
  
  // عند إنشاء صفقة، تحقق من خيار المعاينة
  create: protectedProcedure
    .input(z.object({
      // ... existing fields
      requireInspection?: boolean  // خيار جديد
    }))
    .mutation(async ({ ctx, input }) => {
      // ... existing logic
      
      if (input.requireInspection) {
        // سيتم طلب المعاينة لاحقاً
      }
    }),
});
```

---

## الرسوم والتسعير

| البند | المبلغ | الملاحظات |
|------|--------|----------|
| رسوم المعاينة | 20 د.ل | تُدفع من قبل المشتري |
| عمولة الفاحص | 15 د.ل | من رسوم المعاينة |
| عمولة المنصة | 5 د.ل | من رسوم المعاينة |

---

## سيناريوهات الاستخدام

### السيناريو 1: شراء هاتف ذكي

```
1. المشتري يجد إعلان هاتف ذكي
2. يفتح صفقة escrow
3. يطلب معاينة ميدانية
4. يدفع رسوم المعاينة (20 د.ل)
5. الفاحص يقوم بـ:
   - فحص الشاشة والبطارية
   - اختبار جميع الأزرار والمنافذ
   - التقاط صور من عدة زوايا
   - كتابة تقرير مفصل
6. المشتري يراجع التقرير
7. إذا وافق → يكمل الشراء
   إذا رفض → يطلب معاينة جديدة أو يلغي الصفقة
```

### السيناريو 2: شراء سيارة مستعملة

```
1. المشتري يجد إعلان سيارة
2. يفتح صفقة escrow
3. يطلب معاينة ميدانية (متخصص في السيارات)
4. الفاحص يقوم بـ:
   - فحص شامل للهيكل والدهان
   - اختبار المحرك والأداء
   - فحص الإطارات والفرامل
   - فحص الداخل والمقاعد
   - التقاط صور من الخارج والداخل
5. المشتري يراجع التقرير والصور
6. يتخذ قرار الشراء بناءً على التقرير
```

---

## الأمان والحماية

### حماية المشتري
- ✓ معاينة موثقة من فاحص معتمد
- ✓ صور وتقارير مفصلة
- ✓ درجة تقييم موضوعية
- ✓ حق الرفض والطلب من جديد

### حماية البائع
- ✓ الفاحص محايد ومستقل
- ✓ التقرير موثق ومسجل
- ✓ حماية من الاتهامات الكاذبة

### حماية المنصة
- ✓ فاحصون معتمدون فقط
- ✓ تقييم وتقييم الفاحصين
- ✓ سجل كامل للمعاينات

---

## الإحصائيات والتحليلات

### مؤشرات الأداء الرئيسية

```sql
-- عدد المعاينات المطلوبة يومياً
SELECT DATE(createdAt) as date, COUNT(*) as count
FROM inspectionReports
GROUP BY DATE(createdAt);

-- معدل الموافقة على التقارير
SELECT 
  COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
  COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected,
  COUNT(*) as total
FROM inspectionReports;

-- متوسط درجة التقييم
SELECT AVG(conditionScore) as avg_score
FROM inspectionReports
WHERE status IN ('approved', 'rejected');

-- أداء الفاحصين
SELECT 
  ia.agentName,
  COUNT(ir.id) as total_inspections,
  AVG(ir.conditionScore) as avg_score,
  ia.rating
FROM inspectionAgents ia
LEFT JOIN inspectionReports ir ON ia.userId = ir.inspectorId
GROUP BY ia.id;
```

---

## الخطوات المستقبلية

### المرحلة 2
- [ ] نظام تقييم الفاحصين
- [ ] نظام الشكاوى ضد الفاحصين
- [ ] إعادة المعاينة التلقائية عند الرفض

### المرحلة 3
- [ ] دعم معاينات الفيديو المباشرة
- [ ] تقارير معاينة مخصصة حسب نوع السلعة
- [ ] نماذج معاينة متقدمة

### المرحلة 4
- [ ] تكامل مع خدمات التسليم
- [ ] معاينة عند الاستلام
- [ ] ضمان الجودة المدعوم بالمعاينة

---

## الدعم والمساعدة

للمزيد من المعلومات:
1. اقرأ هذه التوثيق بالكامل
2. افحص الملفات المصدرية للتعليقات
3. فتح issue على GitHub

---

**آخر تحديث:** مارس 2026
**الإصدار:** 1.0
**الحالة:** ✅ جاهز للاستخدام
