# دليل تطبيق نظام الدفع المتقدم

## 🎯 الهدف

هذا الدليل يوضح كيفية تطبيق نظام الدفع المتقدم في مشروع Wathiqly مع جميع التفاصيل التقنية.

---

## ✅ المتطلبات

- Node.js 18+
- pnpm 10+
- MySQL 8+
- TypeScript 5+

---

## 🔧 خطوات التطبيق

### 1. تحديث قاعدة البيانات

#### أ) إضافة الجدول الجديد

```bash
# تشغيل migrations
pnpm db:push
```

#### ب) التحقق من الجدول

```sql
DESC depositRequests;
```

### 2. تحديث الخادم (Backend)

#### أ) استيراد الجدول الجديد

```typescript
// server/routers.ts
import { depositRequests } from '../drizzle/schema';
```

#### ب) إضافة mutation للإيداع

✅ تم بالفعل إضافتها في `server/routers.ts`

### 3. تحديث الواجهة (Frontend)

#### أ) إضافة الصفحة الجديدة

✅ تم إنشاء `client/src/pages/AdvancedPayment.tsx`

#### ب) إضافة الطريق

✅ تم تحديث `client/src/App.tsx`

#### ج) ربط الأزرار

✅ تم تحديث `client/src/pages/WalletManagement.tsx`

---

## 🧪 الاختبار

### 1. اختبار الواجهة

```bash
# تشغيل خادم التطوير
pnpm dev

# الذهاب إلى
# http://localhost:5173/payment
```

### 2. اختبار الخادم

```bash
# اختبار TRPC endpoint
curl -X POST http://localhost:3000/trpc/wallet.requestDeposit \
  -H "Content-Type: application/json" \
  -d '{
    "amount": "100",
    "convertedAmount": "70",
    "paymentMethod": "phone_credit",
    "paymentDetails": {}
  }'
```

### 3. اختبار قاعدة البيانات

```sql
-- التحقق من الطلب
SELECT * FROM depositRequests WHERE userId = 1;

-- التحقق من المعاملة
SELECT * FROM transactions WHERE type = 'deposit';

-- التحقق من السجل
SELECT * FROM auditLogs WHERE action = 'deposit_request';
```

---

## 🔐 الأمان

### 1. التحقق من المدخلات

```typescript
// التحقق من المبلغ
if (amount <= 0) throw new Error('Invalid amount');

// التحقق من الوسيلة
if (!VALID_METHODS.includes(paymentMethod)) {
  throw new Error('Invalid payment method');
}
```

### 2. التشفير

```typescript
// تشفير بيانات الدفع
const encrypted = encryptData(JSON.stringify(paymentDetails));

// فك التشفير عند الحاجة
const decrypted = decryptData(encrypted);
```

### 3. السجلات

```typescript
// تسجيل كل عملية
await createAuditLog({
  userId: user.id,
  action: 'deposit_request',
  entityType: 'deposit',
  entityId: depositId,
  newValue: { amount, method }
});
```

---

## 🔄 التدفق الكامل

### من جانب المستخدم

```
1. المستخدم يذهب إلى /payment
   ↓
2. يختار وسيلة الدفع
   ↓
3. يدخل المبلغ
   ↓
4. يرى العمولة والصافي
   ↓
5. يؤكد العملية
   ↓
6. يرى رسالة النجاح
```

### من جانب النظام

```
1. الواجهة ترسل طلب إلى TRPC
   ↓
2. الخادم ينشئ depositRequest
   ↓
3. الخادم ينشئ transaction
   ↓
4. الخادم ينشئ auditLog
   ↓
5. الخادم يرجع معرّف الطلب
   ↓
6. الواجهة تعرض رسالة النجاح
   ↓
7. (لاحقاً) webhook يؤكد الدفع
   ↓
8. الخادم يحدث الرصيد
```

---

## 💾 حفظ البيانات

### معلومات مهمة

```typescript
// depositRequest
{
  id: 123,
  userId: 456,
  amount: "100.00",           // المبلغ الأصلي
  convertedAmount: "70.00",   // بعد العمولة
  paymentMethod: "phone_credit",
  paymentDetails: "encrypted_data",
  status: "pending",
  createdAt: "2026-03-14T...",
  updatedAt: "2026-03-14T..."
}

// transaction
{
  id: 789,
  userId: 456,
  type: "deposit",
  amount: "70.00",            // الصافي
  status: "pending",
  reference: "DEP-123",
  description: "إيداع عبر phone_credit (المبلغ الأصلي: 100 د.ل)",
  createdAt: "2026-03-14T..."
}

// auditLog
{
  id: 999,
  userId: 456,
  action: "deposit_request",
  entityType: "deposit",
  entityId: 123,
  newValue: {
    amount: "100.00",
    method: "phone_credit"
  },
  createdAt: "2026-03-14T..."
}
```

---

## 🚀 النشر (Deployment)

### 1. بناء المشروع

```bash
# بناء الواجهة
pnpm build

# بناء الخادم
pnpm build
```

### 2. تشغيل الإنتاج

```bash
# تشغيل الخادم
pnpm start

# الواجهة متاحة على
# http://your-domain/payment
```

### 3. المتغيرات البيئية

```env
# .env.production
DATABASE_URL=mysql://user:pass@host/db
NODE_ENV=production
API_URL=https://api.your-domain.com
```

---

## 📊 المراقبة

### مؤشرات الأداء

```sql
-- إجمالي المبالغ المودعة
SELECT SUM(convertedAmount) FROM depositRequests WHERE status = 'completed';

-- عدد العمليات حسب الوسيلة
SELECT paymentMethod, COUNT(*) FROM depositRequests GROUP BY paymentMethod;

-- نسبة النجاح
SELECT 
  status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100 / (SELECT COUNT(*) FROM depositRequests), 2) as percentage
FROM depositRequests
GROUP BY status;
```

### التنبيهات

```typescript
// تنبيه عند فشل عملية
if (deposit.status === 'failed') {
  sendAlert({
    type: 'deposit_failed',
    userId: deposit.userId,
    amount: deposit.amount
  });
}

// تنبيه عند عملية مريبة
if (amount > SUSPICIOUS_AMOUNT) {
  sendAlert({
    type: 'suspicious_deposit',
    userId: user.id,
    amount: amount
  });
}
```

---

## 🐛 استكشاف الأخطاء

### مشكلة: الواجهة لا تظهر

```bash
# تحقق من الطريق
grep -r "/payment" client/src/App.tsx

# تحقق من الملف
ls -la client/src/pages/AdvancedPayment.tsx
```

### مشكلة: الخادم لا يستجيب

```bash
# تحقق من TRPC router
grep -r "requestDeposit" server/routers.ts

# تحقق من الاتصال
curl http://localhost:3000/health
```

### مشكلة: قاعدة البيانات

```bash
# تحقق من الجدول
mysql -u user -p -e "DESC depositRequests;"

# تحقق من البيانات
mysql -u user -p -e "SELECT * FROM depositRequests LIMIT 5;"
```

---

## 📚 المراجع

### الملفات المهمة

- `drizzle/schema.ts` - تعريف الجداول
- `server/routers.ts` - TRPC endpoints
- `client/src/pages/AdvancedPayment.tsx` - الواجهة
- `PAYMENT_SYSTEM_DOCUMENTATION.md` - التوثيق الكامل

### الموارد الخارجية

- [TRPC Documentation](https://trpc.io)
- [Drizzle ORM](https://orm.drizzle.team)
- [React Documentation](https://react.dev)
- [MySQL Documentation](https://dev.mysql.com)

---

## ✅ قائمة التحقق

- [ ] تم تحديث قاعدة البيانات
- [ ] تم اختبار الواجهة
- [ ] تم اختبار الخادم
- [ ] تم التحقق من الأمان
- [ ] تم توثيق التغييرات
- [ ] تم رفع التغييرات إلى GitHub
- [ ] تم اختبار الإنتاج
- [ ] تم إعداد المراقبة

---

**تم الإنجاز:** 14 مارس 2026
**الإصدار:** 1.0.0
