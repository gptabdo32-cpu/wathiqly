# توثيق API "وثّقلي للأعمال" (DIaaS)

مرحباً بك في توثيق واجهة برمجة تطبيقات "وثّقلي للأعمال". تسمح لك هذه الخدمة بدمج ميزات التحقق من الهوية الرقمية المتقدمة في تطبيقاتك ومواقعك الإلكترونية.

## 1. المصادقة (Authentication)

تستخدم "وثّقلي" نظام Client ID و Client Secret للمصادقة. يجب تضمين هذه البيانات في كل طلب API.

*   **Client ID**: معرف فريد لمشروعك.
*   **Client Secret**: مفتاح سري يجب الحفاظ عليه وعدم مشاركته.

## 2. نقاط النهاية (Endpoints)

### 2.1. بدء عملية التحقق (Initiate Verification)

تُستخدم هذه النقطة لبدء عملية تحقق جديدة لعميلك.

*   **URL**: `/api/trpc/diaas.initiateVerification`
*   **Method**: `POST`
*   **Request Body**:
    ```json
    {
      "clientId": "wth_client_...",
      "clientSecret": "wth_secret_...",
      "clientReferenceId": "your_internal_id_123",
      "fullName": "محمد علي",
      "nationalIdNumber": "119900...",
      "idCardImageUrl": "https://your-storage.com/id.jpg",
      "selfieImageUrl": "https://your-storage.com/selfie.jpg",
      "callbackUrl": "https://your-api.com/webhooks/wathiqly"
    }
    ```
*   **Response**:
    ```json
    {
      "result": {
        "data": {
          "success": true,
          "verificationId": 12345,
          "status": "approved",
          "overallConfidence": 95.5,
          "fraudRiskScore": 5.0,
          "message": "Verification approved successfully."
        }
      }
    }
    ```

### 2.2. استعلام عن حالة التحقق (Get Verification Status)

استخدم هذه النقطة للتحقق من حالة طلب سابق.

*   **URL**: `/api/trpc/diaas.getVerificationStatus`
*   **Method**: `GET` (عبر tRPC query)
*   **Query Parameters**:
    *   `batch=1`
    *   `input={"0":{"clientId":"...","clientSecret":"...","verificationId":12345}}`
*   **Response**:
    ```json
    {
      "result": {
        "data": {
          "verificationId": 12345,
          "status": "approved",
          "overallConfidence": 95.5,
          "faceMatchScore": 98.2,
          "fraudRiskScore": 5.0,
          "extractedData": {
            "fullName": "محمد علي",
            "nationalIdNumber": "119900...",
            "expiryDate": "2028-12-31"
          }
        }
      }
    }
    ```

## 3. حالات الطلب (Status Codes)

| الحالة | الوصف |
| :--- | :--- |
| `approved` | تم التحقق من الهوية بنجاح وتطابق البيانات. |
| `rejected` | تم رفض التحقق (بسبب عدم تطابق الوجه أو شكوك في الاحتيال). |
| `flagged` | يتطلب مراجعة يدوية (درجة ثقة منخفضة أو تحذيرات بسيطة). |
| `pending` | الطلب قيد المعالجة. |

## 4. مثال للتكامل باستخدام Node.js (SDK مبسط)

```javascript
const axios = require('axios');

async function verifyUser(userData) {
  try {
    const response = await axios.post('https://wathiqly.ly/api/trpc/diaas.initiateVerification', {
      clientId: 'YOUR_CLIENT_ID',
      clientSecret: 'YOUR_CLIENT_SECRET',
      ...userData
    });
    
    return response.data.result.data;
  } catch (error) {
    console.error('Verification failed:', error.response.data);
  }
}
```

## 5. أفضل الممارسات الأمنية

1.  **لا تشارك الـ Client Secret**: لا تضع المفتاح السري في كود الواجهة الأمامية (Frontend). استخدمه دائماً من خادمك (Backend).
2.  **استخدم HTTPS**: جميع الطلبات يجب أن تتم عبر بروتوكول آمن.
3.  **التحقق من الـ Webhooks**: إذا كنت تستخدم `callbackUrl` قم بالتحقق من مصدر الطلب.
4.  **تخزين الصور**: تأكد من أن روابط الصور المرسلة آمنة ومتاحة لخوادم وثّقلي للوصول إليها.

---
© 2026 وثّقلي - جميع الحقوق محفوظة.
