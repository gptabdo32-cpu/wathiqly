# توثيق Backend - منصة وثّقلي

## نظرة عامة

منصة وثّقلي تستخدم بنية Backend قوية مع:
- **Express.js** كـ Web Framework
- **tRPC** لـ Type-Safe APIs
- **MySQL/TiDB** لقاعدة البيانات
- **Drizzle ORM** لإدارة قاعدة البيانات
- **OAuth** لتوثيق المستخدمين

---

## البنية المعمارية

```
server/
├── _core/                 # نظام البنية الأساسية
│   ├── index.ts          # نقطة الدخول الرئيسية
│   ├── context.ts        # سياق tRPC
│   ├── trpc.ts           # إعدادات tRPC
│   ├── env.ts            # متغيرات البيئة
│   ├── cookies.ts        # إدارة الـ Cookies
│   ├── oauth.ts          # نظام OAuth
│   ├── encryption.ts     # التشفير
│   ├── llm.ts            # تكامل الذكاء الاصطناعي
│   └── notification.ts   # نظام الإشعارات
├── routers.ts            # جميع الـ Procedures الرئيسية
├── routers/              # Routers الفرعية
│   └── admin.ts          # إدارة النظام
├── db.ts                 # دوال قاعدة البيانات
└── storage.ts            # إدارة التخزين (S3)

drizzle/
├── schema.ts             # تعريف الجداول والعلاقات
└── migrations/           # ملفات الهجرة
```

---

## قاعدة البيانات

### الجداول الرئيسية

#### 1. جدول المستخدمين (users)
```sql
CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  openId VARCHAR(64) UNIQUE NOT NULL,
  name TEXT,
  email VARCHAR(320),
  loginMethod VARCHAR(64),
  role ENUM('user', 'admin') DEFAULT 'user',
  userType ENUM('buyer', 'seller', 'both'),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  lastSignedIn TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 2. جدول المحافظ (wallets)
```sql
CREATE TABLE wallets (
  id INT PRIMARY KEY AUTO_INCREMENT,
  userId INT NOT NULL,
  balance DECIMAL(15, 2) DEFAULT 0,
  currency VARCHAR(3) DEFAULT 'LYD',
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id)
);
```

#### 3. جدول المعاملات (escrows)
```sql
CREATE TABLE escrows (
  id INT PRIMARY KEY AUTO_INCREMENT,
  buyerId INT NOT NULL,
  sellerId INT NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'LYD',
  status ENUM('pending', 'confirmed', 'completed', 'cancelled', 'disputed') DEFAULT 'pending',
  description TEXT,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (buyerId) REFERENCES users(id),
  FOREIGN KEY (sellerId) REFERENCES users(id)
);
```

#### 4. جدول النزاعات (disputes)
```sql
CREATE TABLE disputes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  escrowId INT NOT NULL,
  initiatorId INT NOT NULL,
  reason TEXT NOT NULL,
  status ENUM('open', 'in_review', 'resolved', 'closed') DEFAULT 'open',
  resolution TEXT,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (escrowId) REFERENCES escrows(id),
  FOREIGN KEY (initiatorId) REFERENCES users(id)
);
```

#### 5. جدول التحقق من الهوية (kyc_verifications)
```sql
CREATE TABLE kyc_verifications (
  id INT PRIMARY KEY AUTO_INCREMENT,
  userId INT NOT NULL,
  status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  documentType VARCHAR(50),
  documentUrl TEXT,
  verifiedAt TIMESTAMP,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id)
);
```

#### 6. جدول الإشعارات (notifications)
```sql
CREATE TABLE notifications (
  id INT PRIMARY KEY AUTO_INCREMENT,
  userId INT NOT NULL,
  type VARCHAR(50),
  title VARCHAR(255),
  content TEXT,
  isRead BOOLEAN DEFAULT FALSE,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id)
);
```

---

## الـ APIs والـ Procedures

### 1. المستخدمين (User Router)

```typescript
// الحصول على بيانات المستخدم الحالي
trpc.auth.me.useQuery()

// تحديث ملف المستخدم
trpc.user.updateProfile.useMutation({
  name: string,
  email: string,
  userType: 'buyer' | 'seller' | 'both'
})

// تسجيل الخروج
trpc.auth.logout.useMutation()
```

### 2. المعاملات (Escrow Router)

```typescript
// إنشاء معاملة جديدة
trpc.escrow.createEscrow.useMutation({
  sellerId: number,
  amount: number,
  currency: string,
  description: string
})

// الحصول على معاملات المستخدم
trpc.escrow.getUserEscrows.useQuery({
  userId: number
})

// تأكيد استقبال المنتج
trpc.escrow.confirmReceipt.useMutation({
  escrowId: number
})

// إلغاء المعاملة
trpc.escrow.cancelEscrow.useMutation({
  escrowId: number,
  reason: string
})
```

### 3. النزاعات (Dispute Router)

```typescript
// فتح نزاع
trpc.dispute.openDispute.useMutation({
  escrowId: number,
  reason: string,
  evidence: File[]
})

// الحصول على النزاعات
trpc.dispute.getDisputes.useQuery({
  status: string
})

// حل النزاع (للمسؤولين)
trpc.admin.resolveDispute.useMutation({
  disputeId: number,
  resolution: string,
  status: 'completed' | 'cancelled'
})
```

### 4. المنتجات (Product Router)

```typescript
// البحث عن المنتجات
trpc.product.searchProducts.useQuery({
  query: string,
  category: string,
  minPrice: number,
  maxPrice: number,
  sortBy: 'newest' | 'popular' | 'price' | 'rating'
})

// الحصول على تفاصيل المنتج
trpc.product.getProduct.useQuery({
  productId: number
})

// إضافة منتج جديد (للبائعين)
trpc.product.createProduct.useMutation({
  name: string,
  description: string,
  price: number,
  category: string,
  images: File[]
})
```

### 5. المحافظ (Wallet Router)

```typescript
// الحصول على رصيد المحفظة
trpc.wallet.getBalance.useQuery({
  userId: number
})

// السحب من المحفظة
trpc.wallet.withdraw.useMutation({
  amount: number,
  bankAccount: string
})

// الإيداع في المحفظة
trpc.wallet.deposit.useMutation({
  amount: number,
  paymentMethod: string
})
```

---

## نظام الأمان

### 1. التوثيق (Authentication)

```typescript
// OAuth Flow
1. المستخدم ينقر على "تسجيل الدخول"
2. إعادة توجيه إلى خادم OAuth
3. التحقق من البيانات
4. إنشاء جلسة آمنة (JWT Cookie)
5. إعادة توجيه إلى الموقع
```

### 2. التشفير (Encryption)

```typescript
// تشفير البيانات الحساسة
import { encrypt, decrypt } from "@/server/_core/encryption";

const encrypted = encrypt(sensitiveData);
const decrypted = decrypt(encrypted);
```

### 3. التحقق من الهوية (KYC)

```typescript
// عملية التحقق من الهوية
1. رفع المستندات (بطاقة هوية، جواز سفر)
2. التحقق اليدوي من قبل الفريق
3. الموافقة أو الرفض
4. تفعيل جميع الميزات بعد الموافقة
```

### 4. السجلات الأمنية (Audit Logs)

```typescript
// تسجيل جميع العمليات الحساسة
- تسجيل الدخول/الخروج
- تغيير البيانات الشخصية
- المعاملات المالية
- فتح النزاعات
```

---

## متغيرات البيئة

```env
# قاعدة البيانات
DATABASE_URL=mysql://user:password@host:3306/wathiqly

# OAuth
VITE_APP_ID=your_app_id
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://oauth.manus.im

# الأمان
JWT_SECRET=your_secret_key

# التخزين
BUILT_IN_FORGE_API_URL=https://api.manus.im
BUILT_IN_FORGE_API_KEY=your_api_key

# البيانات
VITE_ANALYTICS_ENDPOINT=https://analytics.manus.im
VITE_ANALYTICS_WEBSITE_ID=your_website_id
```

---

## تشغيل الخادم

```bash
# تثبيت التبعيات
pnpm install

# تشغيل الخادم في وضع التطوير
pnpm dev

# بناء المشروع
pnpm build

# تشغيل الخادم في الإنتاج
pnpm start

# تشغيل الاختبارات
pnpm test

# دفع التغييرات إلى قاعدة البيانات
pnpm db:push
```

---

## معايير الأمان

✅ **تشفير SSL/TLS** - جميع الاتصالات مشفرة
✅ **JWT Tokens** - توثيق آمن وموثوق
✅ **CORS Protection** - حماية من الطلبات غير المصرح بها
✅ **SQL Injection Prevention** - استخدام Prepared Statements
✅ **Rate Limiting** - حماية من الهجمات
✅ **Data Validation** - التحقق من جميع المدخلات
✅ **Encryption** - تشفير البيانات الحساسة
✅ **Audit Logs** - تسجيل جميع العمليات

---

## الدعم والمساعدة

للمزيد من المعلومات:
- 📧 البريد الإلكتروني: support@wathiqly.com
- 💬 الدعم الفوري: https://wathiqly.com/support
- 📚 التوثيق: https://docs.wathiqly.com
