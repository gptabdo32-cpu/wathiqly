# دليل أمان واجهات API لمحفظة وثّقلي المتكاملة

## نظرة عامة
تم تطوير واجهات API محسّنة لمحفظة وثّقلي بما يتوافق مع أعلى معايير الأمان العالمية (OWASP, PCI-DSS, ISO 27001). يوضح هذا الدليل كيفية استخدام هذه الواجهات بشكل آمن.

## 1. متطلبات الأمان الأساسية

### أ. مفتاح Idempotency (إلزامي لجميع العمليات المالية)
يجب أن يرسل العميل (Client) مفتاح Idempotency فريد مع كل طلب مالي. هذا يضمن عدم تكرار العملية إذا تم إعادة إرسال الطلب.

```typescript
// مثال: إرسال أموال P2P
const idempotencyKey = crypto.randomUUID(); // UUID فريد

const response = await trpc.walletId.sendMoney.mutate({
  receiverPhone: "091XXXXXXX",
  amount: "50.00",
  idempotencyKey: idempotencyKey, // مفتاح فريد
  note: "تحويل شخصي"
});
```

### ب. معدل الحد من الطلبات (Rate Limiting)
تطبق الخادم حدود على عدد الطلبات لمنع هجمات التخمين والإغراق:

| العملية | الحد الأقصى | المدة |
| :--- | :--- | :--- |
| إرسال أموال (sendMoney) | 10 طلبات | دقيقة واحدة |
| دفع فواتير (payBill) | 20 طلب | دقيقة واحدة |
| تفويض SSO (authorizeSSO) | 5 طلبات | دقيقة واحدة |

إذا تجاوزت الحد، ستتلقى الخطأ: `TOO_MANY_REQUESTS`

## 2. مدفوعات P2P الآمنة

### المتطلبات الأمنية
- **التحقق من الهوية**: يجب أن يكون المستخدم في المستوى 2 على الأقل (Level 2+).
- **التحقق من الرقم**: يتم التحقق من صيغة رقم الهاتف الليبي (091-095).
- **الكشف عن الأنماط المريبة**: يتم فحص العمليات للكشف عن محاولات احتيال.

### مثال الاستخدام
```typescript
import { v4 as uuidv4 } from 'uuid';

const sendMoneyExample = async () => {
  try {
    const response = await trpc.walletId.sendMoney.mutate({
      receiverPhone: "091234567890",
      amount: "100.00",
      note: "دفع للمشتريات",
      idempotencyKey: uuidv4(), // مفتاح فريد
    });

    console.log("تم التحويل بنجاح:", response.reference);
    // reference: "P2P-550e8400-e29b-41d4-a716-446655440000"
  } catch (error) {
    if (error.code === "TOO_MANY_REQUESTS") {
      console.error("تم تجاوز حد الطلبات. حاول لاحقاً.");
    } else if (error.code === "FORBIDDEN") {
      console.error("يجب إكمال التحقق من الهوية أولاً.");
    }
  }
};
```

## 3. دفع الفواتير بأمان

### المتطلبات
- معرف فريد للعملية (Idempotency Key)
- مبلغ صحيح بصيغة عددية
- معرف الفاتورة الصحيح (رقم الهاتف، رقم الحساب، إلخ)

### مثال الاستخدام
```typescript
const payBillExample = async () => {
  try {
    const response = await trpc.walletId.payBill.mutate({
      provider: "libyana",
      billIdentifier: "091234567890",
      amount: "50.00",
      billType: "topup",
      idempotencyKey: uuidv4(),
    });

    console.log("تم دفع الفاتورة:", response.reference);
  } catch (error) {
    console.error("فشل دفع الفاتورة:", error.message);
  }
};
```

## 4. الهوية الرقمية الموحدة (SSO) مع OAuth 2.0 PKCE

### آلية PKCE (Proof Key for Code Exchange)
تطبق هذه الآلية معيار OAuth 2.0 الحديث لحماية التطبيقات الأصلية (Native Apps) من اعتراض رمز التفويض.

### خطوات التدفق
1. **إنشاء Code Verifier**: سلسلة عشوائية (43-128 حرف)
2. **إنشاء Code Challenge**: SHA256(Code Verifier)
3. **طلب التفويض**: إرسال Code Challenge
4. **استقبال Authorization Code**: رمز قصير الأجل
5. **تبديل الرمز**: إرسال Authorization Code + Code Verifier للحصول على Access Token

### مثال الاستخدام
```typescript
import crypto from 'crypto';

const generatePKCE = () => {
  // 1. إنشاء Code Verifier (عشوائي، 43-128 حرف)
  const codeVerifier = crypto
    .randomBytes(32)
    .toString('base64url')
    .slice(0, 128);

  // 2. إنشاء Code Challenge (SHA256 من Verifier)
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  return { codeVerifier, codeChallenge };
};

const authorizeSSO = async () => {
  const { codeVerifier, codeChallenge } = generatePKCE();

  try {
    const response = await trpc.walletId.authorizeSSO.mutate({
      clientId: "my-app-client-id",
      scopes: ["profile", "phone", "identity_status"],
      redirectUri: "https://myapp.com/callback",
      codeChallenge: codeChallenge,
      codeChallengeMethod: "S256", // SHA256
    });

    console.log("تم التفويض:", response.authCode);
    
    // حفظ Code Verifier بأمان (في الذاكرة أو Storage محمي)
    sessionStorage.setItem('pkce_verifier', codeVerifier);
    
    // إعادة التوجيه إلى رابط الاستدعاء
    window.location.href = response.redirectUrl;
  } catch (error) {
    console.error("فشل التفويض:", error.message);
  }
};
```

## 5. سجل التدقيق (Audit Trail)

### الوصول إلى السجل
يمكنك الحصول على سجل كامل لجميع العمليات المالية:

```typescript
const getAuditTrail = async () => {
  const trail = await trpc.walletId.getAuditTrail.query({
    startTime: Date.now() - 86400000, // آخر 24 ساعة
    endTime: Date.now(),
    limit: 100,
  });

  trail.forEach(entry => {
    console.log(`${entry.action} - ${new Date(entry.timestamp).toLocaleString()}`);
    console.log(`  الحالة السابقة: ${JSON.stringify(entry.previousState)}`);
    console.log(`  الحالة الجديدة: ${JSON.stringify(entry.newState)}`);
  });
};
```

## 6. معالجة الأخطاء الأمنية

### رموز الأخطاء الشائعة

| رمز الخطأ | الوصف | الإجراء المقترح |
| :--- | :--- | :--- |
| `FORBIDDEN` | المستخدم لم يكمل التحقق من الهوية | إرشاد المستخدم لإكمال التحقق |
| `TOO_MANY_REQUESTS` | تم تجاوز حد الطلبات | الانتظار والمحاولة لاحقاً |
| `BAD_REQUEST` | بيانات غير صحيحة أو رصيد غير كافٍ | التحقق من صحة البيانات |
| `UNAUTHORIZED` | عدم التفويض للوصول | إعادة محاولة التفويض |

## 7. أفضل الممارسات الأمنية

1. **استخدم HTTPS دائماً**: جميع الاتصالات يجب أن تكون مشفرة.
2. **احفظ Tokens بأمان**: استخدم HttpOnly Cookies أو Secure Storage.
3. **تحقق من Idempotency Key**: تأكد من إرسال مفتاح فريد لكل عملية.
4. **راقب سجل التدقيق**: افحص السجلات بانتظام للكشف عن أنشطة مريبة.
5. **طبق 2FA للعمليات الكبيرة**: استخدم التحقق الثنائي للتحويلات الكبيرة.

## 8. الامتثال والمعايير

تتوافق واجهات API مع المعايير التالية:

- **OWASP Top 10**: حماية من أعلى 10 تهديدات أمنية
- **PCI-DSS**: معايير أمان معالجة البطاقات والعمليات المالية
- **ISO 27001**: معايير إدارة الأمان والمعلومات
- **OAuth 2.0 / OpenID Connect**: معايير المصادقة والتفويض

## 9. الدعم والإبلاغ عن الثغرات

إذا اكتشفت ثغرة أمنية، يرجى الإبلاغ عنها فوراً إلى فريق الأمان في وثّقلي عبر:
- البريد الإلكتروني: security@wathiqly.com
- النموذج الآمن: https://wathiqly.com/security-report
