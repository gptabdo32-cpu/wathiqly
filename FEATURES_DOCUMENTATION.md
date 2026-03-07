# توثيق الميزات الجديدة - واثق لي

## نظرة عامة
تم إضافة ميزتين رئيسيتين إلى منصة واثق لي لتحسين تجربة المستخدم وتعزيز الأمان:

1. **نظام الرابط الموقوت** (Time-Locked Link)
2. **محفظة النزاع المحايدة** (Dispute Collateral Wallet)

---

## 1. نظام الرابط الموقوت (Time-Locked Link) ⏳

### الهدف
تسهيل وتسريع عملية البيع من خلال إنشاء روابط جاهزة يرسلها البائع للمشتري، مما يقلل من تردد المشتري ويمنع الأخطاء في إدخال البيانات.

### المنطق
1. البائع ينشئ رابط صفقة يتضمن:
   - اسم الصفقة
   - وصف تفصيلي
   - المبلغ المطلوب
   - نوع الصفقة (سلعة مادية / حساب رقمي / خدمة)
   - رسوم المنصة
   - مدة صلاحية الرابط (1 ساعة إلى 7 أيام)

2. البائع يشارك الرابط مع المشتري عبر واتساب أو أي تطبيق آخر

3. المشتري يفتح الرابط ويرى جميع تفاصيل الصفقة جاهزة

4. المشتري يضغط "تأكيد وحجز الأموال" (One-Click Checkout)

5. يتم إنشاء صفقة escrow تلقائياً ويتم توجيه المشتري لإتمام الدفع

### الفوائد
- **تقليل التردد**: المشتري يرى كل شيء واضح وجاهز
- **منع الأخطاء**: لا حاجة لإدخال بيانات يدوياً
- **سرعة العملية**: عملية شراء بنقرة واحدة
- **تتبع أفضل**: يمكن للبائع تتبع من استخدم الرابط

### الملفات المتعلقة

#### Backend
- `drizzle/schema_new_features.ts` - جدول `timedLinks`
- `server/db_new_features.ts` - دوال قاعدة البيانات
- `server/routers/timedLinks.ts` - API endpoints

#### Frontend
- `client/src/components/CreateTimedLink.tsx` - نموذج إنشاء الرابط
- `client/src/components/TimedLinkViewer.tsx` - صفحة عرض الرابط

### API Endpoints

#### إنشاء رابط موقوت
```typescript
POST /trpc/timedLinks.create
{
  title: string,
  description?: string,
  amount: string,
  dealType: "physical" | "digital_account" | "service",
  specifications?: Record<string, any>,
  commissionPercentage?: string,
  commissionPaidBy?: "buyer" | "seller" | "split",
  expirationHours: number (1-168)
}
```

#### الحصول على تفاصيل الرابط
```typescript
GET /trpc/timedLinks.getByToken
{
  token: string
}
```

#### استخدام الرابط
```typescript
POST /trpc/timedLinks.use
{
  token: string
}
```

#### الحصول على روابط البائع
```typescript
GET /trpc/timedLinks.getMyLinks
{
  limit?: number,
  offset?: number
}
```

#### إلغاء رابط
```typescript
POST /trpc/timedLinks.cancel
{
  linkId: number
}
```

### جدول قاعدة البيانات

```sql
CREATE TABLE timedLinks (
  id INT PRIMARY KEY AUTO_INCREMENT,
  linkToken VARCHAR(64) UNIQUE NOT NULL,
  createdBy INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  amount DECIMAL(15,2) NOT NULL,
  dealType ENUM('physical', 'digital_account', 'service'),
  specifications JSON,
  commissionPercentage DECIMAL(5,2),
  commissionPaidBy ENUM('buyer', 'seller', 'split'),
  expiresAt TIMESTAMP NOT NULL,
  isUsed BOOLEAN DEFAULT FALSE,
  usedBy INT,
  usedAt TIMESTAMP,
  escrowId INT,
  status ENUM('active', 'expired', 'used', 'cancelled'),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

---

## 2. محفظة النزاع المحايدة (Dispute Collateral Wallet) ⚖️

### الهدف
منع النزاعات الكاذبة والمزعجة من خلال طلب ضمان مالي عند فتح نزاع، مما يضمن أن من يفتح نزاعاً هو شخص جاد ولديه مشكلة حقيقية.

### المنطق
1. عند فتح نزاع، يجب على المستخدم إيداع مبلغ رمزي (5 د.ل افتراضياً)

2. المبلغ يتم حجزه في "محفظة النزاع المحايدة"

3. عند حل النزاع:
   - **إذا ربح المستخدم**: يسترد المبلغ إلى محفظته
   - **إذا خسر المستخدم**: يتم مصادرة المبلغ (يذهب للبائع أو المنصة حسب الإعدادات)

### الفوائد
- **منع الإساءة**: يقلل من النزاعات الكاذبة بنسبة كبيرة
- **حماية البائعين**: لا يتم تجميد أموال البائع بسبب نزاعات وهمية
- **عدالة**: من يفتح نزاعاً حقيقياً يسترد المبلغ
- **إيرادات إضافية**: المبالغ المصادرة تذهب للمنصة أو البائع

### الملفات المتعلقة

#### Backend
- `drizzle/schema_new_features.ts` - الجداول:
  - `disputeCollaterals`
  - `disputeCollateralWallets`
  - `featureSettings`
- `server/db_new_features.ts` - دوال قاعدة البيانات
- `server/routers/disputeCollateral.ts` - API endpoints

#### Frontend
- `client/src/components/DisputeCollateralWallet.tsx` - واجهة المحفظة

### API Endpoints

#### الحصول على محفظة النزاع
```typescript
GET /trpc/disputeCollateral.getWallet
```

#### إيداع ضمان عند فتح نزاع
```typescript
POST /trpc/disputeCollateral.depositCollateral
{
  escrowId: number,
  amount: string
}
```

#### الحصول على تفاصيل الضمان
```typescript
GET /trpc/disputeCollateral.getByEscrow
{
  escrowId: number
}
```

#### الحصول على الضمانات النشطة
```typescript
GET /trpc/disputeCollateral.getActiveCollaterals
{
  limit?: number,
  offset?: number
}
```

#### حل الضمان (Admin)
```typescript
POST /trpc/disputeCollateral.resolveCollateral
{
  collateralId: number,
  resolution: "refund" | "forfeit",
  reason?: string
}
```

#### إيداع أموال في محفظة النزاع
```typescript
POST /trpc/disputeCollateral.depositFunds
{
  amount: string,
  paymentMethod: "sadad" | "tadawul" | "edfaali" | "bank_transfer",
  paymentDetails: Record<string, any>
}
```

### جداول قاعدة البيانات

#### جدول الضمانات
```sql
CREATE TABLE disputeCollaterals (
  id INT PRIMARY KEY AUTO_INCREMENT,
  escrowId INT NOT NULL,
  paidBy INT NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  status ENUM('pending', 'held', 'refunded', 'forfeited'),
  reason TEXT,
  resolvedAt TIMESTAMP,
  resolvedBy INT,
  foreitedTo INT,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

#### جدول محفظة الضمانات
```sql
CREATE TABLE disputeCollateralWallets (
  id INT PRIMARY KEY AUTO_INCREMENT,
  userId INT UNIQUE NOT NULL,
  availableBalance DECIMAL(15,2) DEFAULT 0,
  heldBalance DECIMAL(15,2) DEFAULT 0,
  totalForfeited DECIMAL(15,2) DEFAULT 0,
  totalRefunded DECIMAL(15,2) DEFAULT 0,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

#### جدول إعدادات الميزات
```sql
CREATE TABLE featureSettings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  timedLinksEnabled BOOLEAN DEFAULT TRUE,
  timedLinksDefaultExpiration INT DEFAULT 7200,
  timedLinksMaxExpiration INT DEFAULT 604800,
  disputeCollateralEnabled BOOLEAN DEFAULT TRUE,
  disputeCollateralAmount DECIMAL(15,2) DEFAULT 5.0,
  disputeCollateralPercentage DECIMAL(5,2) DEFAULT 0,
  disputeCollateralForfeitedTo ENUM('seller', 'buyer', 'platform', 'split'),
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

---

## التكامل مع النظام الحالي

### تعديلات مقترحة على `routers.ts`

أضف الروابط الجديدة إلى `appRouter`:

```typescript
import { timedLinksRouter } from "./routers/timedLinks";
import { disputeCollateralRouter } from "./routers/disputeCollateral";

export const appRouter = router({
  // ... existing routers
  timedLinks: timedLinksRouter,
  disputeCollateral: disputeCollateralRouter,
});
```

### تعديلات مقترحة على `escrows.ts`

عند فتح نزاع، يجب:
1. التحقق من أن المستخدم لديه رصيد كافي في محفظة النزاع
2. إنشاء سجل ضمان جديد
3. حجز المبلغ من محفظة النزاع

```typescript
// عند فتح نزاع
const collateralWallet = await getOrCreateDisputeCollateralWallet(userId);
if (parseFloat(collateralWallet.availableBalance) < collateralAmount) {
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: "رصيد النزاع المحايد غير كافي",
  });
}
```

---

## خطوات التفعيل

### 1. تشغيل الهجرات
```bash
npm run db:migrate
```

### 2. إضافة الجداول الجديدة
استخدم ملف `schema_new_features.ts` لإنشاء الجداول:
```bash
npm run db:push
```

### 3. تحديث الواجهة الأمامية
أضف المسارات الجديدة إلى `App.tsx`:

```typescript
import { TimedLinkViewer } from "@/components/TimedLinkViewer";
import { CreateTimedLink } from "@/components/CreateTimedLink";
import { DisputeCollateralWallet } from "@/components/DisputeCollateralWallet";

// في الروابط:
<Route path="/timed-link/:token" component={TimedLinkViewer} />
<Route path="/create-timed-link" component={CreateTimedLink} />
<Route path="/dispute-collateral" component={DisputeCollateralWallet} />
```

### 4. الاختبار
- اختبر إنشاء رابط موقوت
- اختبر استخدام الرابط
- اختبر إيداع الأموال في محفظة النزاع
- اختبر فتح نزاع مع الضمان

---

## الأمان والاعتبارات

### الرابط الموقوت
- ✓ التحقق من صلاحية الرابط قبل الاستخدام
- ✓ التحقق من انتهاء الصلاحية
- ✓ منع استخدام الرابط أكثر من مرة
- ✓ تشفير بيانات الصفقة إن أمكن

### محفظة النزاع
- ✓ التحقق من الرصيد قبل حجز الضمان
- ✓ تسجيل جميع العمليات للتدقيق
- ✓ حماية من الاحتيال
- ✓ إمكانية المراجعة من قبل الإدارة

---

## الإحصائيات والمراقبة

### مؤشرات الأداء الرئيسية (KPIs)
- عدد الروابط الموقوتة المنشأة
- معدل استخدام الروابط
- متوسط وقت الاستخدام بعد الإنشاء
- عدد النزاعات المفتوحة مع الضمان
- معدل الضمانات المصادرة مقابل المسترجعة

### لوحة التحكم
يجب إضافة إحصائيات جديدة للمسؤولين:
- إجمالي الضمانات المصادرة
- إجمالي الضمانات المسترجعة
- عدد النزاعات الكاذبة المكتشفة
- الإيرادات من الضمانات المصادرة

---

## الخطوات المستقبلية

1. **تحسينات الواجهة**
   - إضافة رسوم بيانية للإحصائيات
   - تحسين تجربة المستخدم

2. **ميزات إضافية**
   - السماح بإعادة استخدام الروابط
   - إضافة نماذج مخصصة للصفقات
   - دعم الروابط المتكررة

3. **التكامل مع الأنظمة الخارجية**
   - التكامل مع بوابات الدفع
   - إرسال إشعارات عبر SMS/البريد الإلكتروني

4. **التحليلات**
   - تتبع سلوك المستخدمين
   - تحليل معدلات التحويل

---

## الدعم والمساعدة

للمزيد من المعلومات أو الإبلاغ عن مشاكل، يرجى:
1. فتح issue على GitHub
2. التواصل مع فريق التطوير
3. مراجعة التوثيق الكاملة

---

**آخر تحديث**: مارس 2026
**الإصدار**: 1.0
