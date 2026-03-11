# دليل نظام التحقق من الهوية - منصة واثقلي (Wathiqly)

## نظرة عامة

تم تنفيذ نظام متكامل للتحقق من الهوية على منصة Wathiqly لتقليل الاحتيال وزيادة الثقة بين المستخدمين. يتكون النظام من خمس خطوات رئيسية:

1. **التحقق من الهاتف (Phone Verification)** - التحقق من ملكية رقم الهاتف عبر رمز OTP
2. **رفع الهوية الوطنية (ID Upload)** - رفع صورة الهوية واستخراج البيانات بواسطة OCR
3. **التقاط السيلفي (Selfie Capture)** - التقاط صورة حية للتحقق من الحضور
4. **مطابقة الوجه (Face Matching)** - مقارنة وجه السيلفي مع وجه الهوية
5. **تأكيد التحقق (Verification Confirmation)** - عرض نتيجة التحقق النهائية

---

## مستويات التحقق

يتم تقسيم مستويات التحقق إلى أربع مستويات:

| المستوى | الوصف | الصلاحيات |
|--------|-------|----------|
| **Level 0** | لم يتم التحقق | لا يمكن إجراء معاملات كبيرة |
| **Level 1** | تم التحقق من الهاتف | يمكن إجراء معاملات محدودة |
| **Level 2** | تم رفع الهوية الوطنية | يمكن إجراء معاملات متوسطة |
| **Level 3** | تم التحقق الكامل (هوية + سيلفي) | يمكن إجراء معاملات غير محدودة |

---

## البنية التقنية

### قاعدة البيانات (Database)

#### جدول `users` - الحقول الجديدة

```typescript
verificationLevel: int // 0-3
nationalIdNumberEncrypted: text // مشفر بـ AES-256
selfieImageUrl: text
faceMatchScore: decimal
otpCode: varchar(6)
otpExpiresAt: timestamp
```

#### جدول `identity_verifications` - تتبع محاولات التحقق

```typescript
id: int (PK)
userId: int (FK)
nationalIdNumberHash: varchar(64) // SHA-256 hash
fullName: text
idCardImageUrl: text
selfieImageUrl: text
status: enum('pending', 'approved', 'rejected', 'flagged')
faceMatchScore: decimal
rejectionReason: text
attemptCount: int
ipAddress: varchar(45)
userAgent: text
createdAt: timestamp
updatedAt: timestamp
```

---

## واجهات برمجية (APIs)

### 1. إرسال رمز التحقق

**Endpoint:** `POST /api/verify/send-otp`

**Request:**
```json
{
  "phone": "09XXXXXXXX"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP sent successfully."
}
```

### 2. التحقق من رمز OTP

**Endpoint:** `POST /api/verify/check-otp`

**Request:**
```json
{
  "phone": "09XXXXXXXX",
  "otp": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Phone number verified successfully."
}
```

### 3. رفع الهوية الوطنية

**Endpoint:** `POST /api/verify/upload-id`

**Request:**
```json
{
  "idCardImageBase64": "data:image/png;base64,iVBORw0KGgo..."
}
```

**Response:**
```json
{
  "success": true,
  "message": "National ID uploaded successfully."
}
```

### 4. رفع السيلفي

**Endpoint:** `POST /api/verify/upload-selfie`

**Request:**
```json
{
  "selfieImageBase64": "data:image/png;base64,iVBORw0KGgo..."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Selfie uploaded successfully."
}
```

### 5. مطابقة الوجه

**Endpoint:** `POST /api/verify/face-match`

**Response:**
```json
{
  "success": true,
  "score": 95,
  "isVerified": true,
  "message": "Face matching completed."
}
```

### 6. جلب حالة التحقق

**Endpoint:** `GET /api/verify/status`

**Response:**
```json
{
  "isPhoneVerified": true,
  "isIdentityVerified": true,
  "verificationLevel": 3,
  "nationalIdNumberEncrypted": "********",
  "identityDocumentUrl": "https://...",
  "selfieImageUrl": "https://...",
  "faceMatchScore": 95
}
```

---

## واجهة المستخدم (Frontend)

### مكون `IdentityVerification.tsx`

يقع في `client/src/pages/IdentityVerification.tsx` ويوفر واجهة تفاعلية لإكمال خطوات التحقق.

**المميزات:**

- عرض تقدمي للخطوات (Stepper)
- معالجة أخطاء شاملة مع رسائل توضيحية
- دعم رفع الصور بصيغ متعددة
- عرض نسبة تطابق الوجه
- حفظ التقدم تلقائياً

**الوصول:** `/verify`

---

## الأمان

### تشفير البيانات الحساسة

يتم تشفير رقم الهوية الوطنية باستخدام **AES-256-GCM** قبل تخزينه في قاعدة البيانات:

```typescript
import { encryptData, decryptData } from '../_core/encryption';

const encrypted = encryptData(nationalIdNumber);
const decrypted = decryptData(encrypted);
```

### منع التكرار

يتم حفظ hash SHA-256 لرقم الهوية الوطنية في جدول `identity_verifications` لمنع استخدام نفس الهوية لأكثر من حساب:

```typescript
const nationalIdNumberHash = hashData(nationalIdNumber);
```

### معدل التحديد (Rate Limiting)

يمكن إضافة rate limiting على محاولات التحقق:

```typescript
// يجب تنفيذه في middleware
const VERIFICATION_ATTEMPTS_LIMIT = 5;
const VERIFICATION_ATTEMPTS_WINDOW = 3600; // ساعة واحدة
```

---

## التطوير والتوسع

### إضافة خدمة OCR حقيقية

حالياً، يتم محاكاة استخراج البيانات من الهوية. لإضافة خدمة OCR حقيقية:

```typescript
// في server/routers/verification.ts
import { extractIdData } from '../_core/ocr'; // خدمة OCR

const extractedData = await extractIdData(imageBuffer);
const { fullName, nationalIdNumber } = extractedData;
```

### إضافة خدمة مطابقة الوجه الحقيقية

حالياً، يتم محاكاة مطابقة الوجه. لإضافة خدمة حقيقية:

```typescript
// في server/routers/verification.ts
import { compareFaces } from '../_core/faceRecognition'; // خدمة مطابقة الوجه

const faceMatchScore = await compareFaces(idCardImageUrl, selfieImageUrl);
```

---

## معايير الموافقة

- **نسبة تطابق الوجه:** ≥ 90% للموافقة على التحقق
- **صيغ الصور المدعومة:** PNG, JPG, JPEG
- **حجم الصورة الأقصى:** 5 MB
- **صلاحية رمز OTP:** 5 دقائق

---

## الأخطاء الشائعة والحلول

| الخطأ | السبب | الحل |
|------|------|------|
| "رقم الهاتف غير موجود" | المستخدم لم يسجل حساباً | تسجيل حساب جديد أولاً |
| "رمز التحقق منتهي الصلاحية" | انقضت 5 دقائق | طلب رمز جديد |
| "الهوية مرتبطة بحساب آخر" | نفس الهوية لحسابين | استخدام هوية مختلفة |
| "فشل التحقق من الوجه" | نسبة التطابق < 90% | إعادة التقاط صورة أوضح |

---

## الخطوات التالية

1. **دمج خدمة SMS حقيقية** - استبدال محاكاة SMS بخدمة حقيقية (Twilio, Nexmo)
2. **إضافة OCR متقدم** - استخدام Google Vision API أو AWS Rekognition
3. **تحسين مطابقة الوجه** - استخدام Face++ أو AWS Rekognition
4. **إضافة Liveness Detection** - التحقق من أن السيلفي حي وليس صورة
5. **تحديثات الأمان** - إضافة rate limiting وتسجيل محاولات التحقق المريبة

---

## الدعم والمساهمة

للإبلاغ عن مشاكل أو المساهمة في تحسين النظام، يرجى فتح issue أو pull request على GitHub.
