# 🔐 ميزة التحقق من الهوية عبر السلوك - Behavioral Biometrics

## 📋 نظرة عامة

تم إضافة ميزة أمان متقدمة تحلل **نمط تفاعل المستخدم** مع التطبيق لاكتشاف الوصول غير المصرح به. هذه الميزة تعمل كطبقة أمان إضافية حتى لو كان المهاجم يملك كلمة المرور الصحيحة.

### 🎯 الهدف الرئيسي

```
إذا قام شخص آخر باستخدام الحساب حتى لو كان يملك كلمة المرور،
سيكتشف الذكاء الاصطناعي أن "نمط الحركة" مختلف ويغلق الحساب فوراً.
```

---

## ✨ المميزات الرئيسية

### 1️⃣ تحليل سرعة الكتابة
```
📊 ما يتم قياسه:
  • Dwell Time: مدة الضغط على المفتاح
  • Flight Time: الوقت بين الضغطات
  
🎯 الفائدة:
  • كل شخص له نمط كتابة فريد
  • دقة 85-95% في التمييز
```

### 2️⃣ تحليل نمط التمرير
```
📊 ما يتم قياسه:
  • سرعة التمرير (Scroll Speed)
  • التسارع والتباطؤ
  • المسافة المقطوعة
  
🎯 الفائدة:
  • اكتشاف السلوك الطبيعي
  • اكتشاف الروبوتات والأتمتة
```

### 3️⃣ تحليل اتجاه الجهاز
```
📊 ما يتم قياسه:
  • زوايا الجهاز (Alpha, Beta, Gamma)
  • استقرار الجهاز
  
🎯 الفائدة:
  • التحقق من الاستخدام الطبيعي
  • اكتشاف محاكاة الأجهزة
```

---

## 🏗️ البنية المعمارية

### 📁 الملفات المضافة

```
wathiqly/
├── drizzle/
│   └── schema_behavioral_biometrics.ts    # مخطط قاعدة البيانات
├── server/
│   ├── routers/
│   │   └── behavioral.ts                  # نقاط نهاية tRPC
│   └── behavioral.test.ts                 # اختبارات شاملة
├── client/
│   ├── src/
│   │   ├── hooks/
│   │   │   └── useBehavioralBiometrics.ts # خطاف جمع البيانات
│   │   └── components/
│   │       └── BehavioralBiometricsProvider.tsx # مزود الخدمة
│   └── src/
│       └── App.tsx                        # تطبيق معدل
└── docs/
    └── BEHAVIORAL_BIOMETRICS_GUIDE.md    # دليل شامل
```

### 🗄️ قاعدة البيانات

#### جدول `behavioral_patterns`
```sql
CREATE TABLE behavioral_patterns (
  id INT PRIMARY KEY AUTO_INCREMENT,
  userId INT NOT NULL REFERENCES users(id),
  typingPattern JSON,           -- {avgDwell, avgFlight}
  scrollPattern JSON,           -- {avgSpeed, avgAccel}
  orientationPattern JSON,      -- {avgBeta, stability}
  interactionPattern JSON,      -- نمط التفاعل العام
  sampleCount INT DEFAULT 0,    -- عدد العينات
  isLocked BOOLEAN DEFAULT false,
  lastMismatchAt TIMESTAMP,
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP DEFAULT NOW() ON UPDATE NOW()
);
```

#### جدول `behavioral_sessions`
```sql
CREATE TABLE behavioral_sessions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  userId INT NOT NULL REFERENCES users(id),
  sessionId VARCHAR(255) NOT NULL,
  sessionData JSON NOT NULL,
  similarityScore DECIMAL(5,2),  -- 0-100
  isSuspicious BOOLEAN DEFAULT false,
  deviceInfo JSON,
  ipAddress VARCHAR(45),
  createdAt TIMESTAMP DEFAULT NOW()
);
```

---

## 🚀 كيفية الاستخدام

### للمطورين

#### 1. تفعيل الميزة في التطبيق
```tsx
// في App.tsx (تم تطبيقه بالفعل)
import { BehavioralBiometricsProvider } from '@/components/BehavioralBiometricsProvider';

function App() {
  return (
    <BehavioralBiometricsProvider>
      <Router />
    </BehavioralBiometricsProvider>
  );
}
```

#### 2. استخدام الخطاف في مكون
```tsx
import { useBehavioralBiometrics } from '@/hooks/useBehavioralBiometrics';

function MyComponent() {
  useBehavioralBiometrics(); // بدء جمع البيانات تلقائياً
  
  return <div>محتوى التطبيق</div>;
}
```

#### 3. التحقق من حالة الحساب
```tsx
import { trpc } from '@/lib/trpc';

function SecurityStatus() {
  const { data: pattern } = trpc.behavioral.getPatternStatus.useQuery();
  
  return (
    <div>
      {pattern?.isLocked ? (
        <Alert>الحساب مقفول بسبب نشاط مشبوه</Alert>
      ) : (
        <Alert>الحساب آمن</Alert>
      )}
    </div>
  );
}
```

### للمستخدمين

#### ✅ ما يحدث تلقائياً
- جمع بيانات السلوك أثناء الاستخدام الطبيعي
- بناء ملف شخصي بعد الاستخدام الأول
- مراقبة مستمرة للنشاط المشبوه

#### ⚠️ إذا تم قفل الحساب
1. ستظهر رسالة تحذيرية
2. يطلب منك التحقق من الهوية الوطنية
3. يتم فتح الحساب بعد التحقق الناجح

---

## 📊 سير العمل

### المرحلة 1: بناء الملف الشخصي (Learning)
```
الجلسة الأولى → جمع بيانات → 50+ حدث كتابة → إنشاء ملف مرجعي
```

### المرحلة 2: التحقق المستمر (Verification)
```
كل جلسة → جمع بيانات → مقارنة مع الملف → حساب درجة التطابق
```

### المرحلة 3: اكتشاف الشذوذ (Anomaly Detection)
```
درجة منخفضة → تحذير → محاولات متكررة → قفل الحساب
```

---

## 🔢 عتبات الأمان

| درجة التطابق | الحالة | الإجراء |
|-------------|--------|--------|
| **> 70** | ✅ آمن | السماح بالوصول |
| **40-70** | ⚠️ تحذير | مراقبة إضافية |
| **< 40** | 🔒 خطير | قفل الحساب |

---

## 🧪 الاختبارات

### تشغيل الاختبارات
```bash
npm run test behavioral.test.ts
```

### الاختبارات المتضمنة
- ✅ إنشاء الملف الشخصي الأولي
- ✅ حساب درجة التطابق
- ✅ تحديد عتبات الأمان
- ✅ تخزين بيانات الجلسة
- ✅ قفل الحساب
- ✅ تعلم الأنماط
- ✅ دعم الأجهزة المتعددة
- ✅ حماية الخصوصية

---

## 🔒 الخصوصية والأمان

### ✅ ما يتم حفظه
- المتوسطات الإحصائية فقط
- لا البيانات الخام للكتابة
- معلومات الجهاز العامة

### 🚫 ما لا يتم حفظه
- نصوص الكتابة الفعلية
- كلمات المرور
- بيانات حساسة أخرى

### 🔐 التشفير
- جميع البيانات مشفرة في قاعدة البيانات
- الاتصال عبر HTTPS
- لا تخزين محلي للبيانات الحساسة

---

## 🐛 استكشاف الأخطاء

### ❌ المشكلة: الحساب مقفول بسبب تغيير السلوك

**الحل**:
1. تأكد من استخدام جهاز معروف
2. جرب من موقع معروف
3. اتصل بالدعم الفني

### ❌ المشكلة: درجة التطابق منخفضة

**الأسباب**:
- استخدام جهاز جديد
- تغيير نمط الكتابة
- مشاكل في الاتصال

**الحل**:
- أعد تحميل الصفحة
- استخدم جهاز معروف
- انتظر 24 ساعة

---

## 📈 الإحصائيات والمراقبة

### لوحة تحكم المسؤول
```
📊 عدد الحسابات المقفولة: X
📊 متوسط درجة التطابق: Y%
📊 عدد الجلسات المشبوهة: Z
```

### التنبيهات
- 🔔 قفل حساب جديد
- 🔔 نشاط مشبوه متكرر
- 🔔 تغيير كبير في السلوك

---

## 🔄 التكامل مع الميزات الأخرى

### مع Liveness Detection
- التحقق الحي: هل الشخص حي وحقيقي؟
- التحقق السلوكي: هل السلوك طبيعي؟

### مع Fraud Detection
- دمج درجة التطابق في نموذج المخاطر
- أولويات أعلى للحسابات المشبوهة

---

## 🚀 الميزات المستقبلية

- [ ] تحليل حركة الماوس
- [ ] تحليل نمط اللمس
- [ ] نماذج التعلم الآلي المتقدمة
- [ ] تكامل مع خدمات IP Reputation
- [ ] لوحة تحكم متقدمة للمستخدم
- [ ] تنبيهات فورية للنشاط المشبوه

---

## 📚 المراجع

### الأبحاث الأكاديمية
- Keystroke Dynamics: A Review (2021)
- Behavioral Biometrics: A Survey (2020)
- Continuous Authentication (2019)

### المعايير الصناعية
- NIST SP 800-63B
- ISO/IEC 30107

---

## 📞 الدعم والمساعدة

- 📧 البريد الإلكتروني: support@wathiqly.com
- 🌐 الموقع: https://wathiqly.com/help
- 💬 الدردشة: في التطبيق

---

## 📝 الترخيص

جميع الملفات المضافة تحت نفس ترخيص المشروع الأصلي.

---

**آخر تحديث**: مارس 2026
**الإصدار**: 1.0.0
