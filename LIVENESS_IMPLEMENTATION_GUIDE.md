# دليل تطبيق نظام كشف الحيوية التفاعلي

## نظرة عامة

تم تطوير نظام كشف الحيوية التفاعلي (Interactive Liveness Detection) الذي يستخدم تقنيات متقدمة للتحقق من أن المستخدم إنسان حي وليس صورة أو قناع أو فيديو مسجل أو تزييف عميق (Deepfake).

## المكونات الرئيسية

### 1. الخلفية (Backend)

#### tRPC Endpoints
- `liveness.startSession` - بدء جلسة كشف حيوية جديدة مع تحديات عشوائية
- `liveness.submitVideo` - إرسال الفيديو المسجل للتحليل
- `liveness.getSessionStatus` - الحصول على حالة الجلسة الحالية
- `liveness.getHistory` - الحصول على سجل التحقق السابق
- `liveness.getStats` - إحصائيات التحقق للمستخدم
- `liveness.getStatus` - الحالة الحالية للمستخدم

#### API Upload
- `POST /api/upload` - رفع ملف الفيديو للتخزين

#### منطق التحليل
- `analyzeVideoForLiveness()` - تحليل الفيديو باستخدام LLM Vision API
- `calculateComprehensiveRiskScore()` - حساب درجة المخاطرة
- `validateLivenessResult()` - التحقق من نتائج الحيوية

### 2. الواجهة الأمامية (Frontend)

#### المكونات الرئيسية
- `LivenessDetectionEnhanced.tsx` - مكون كشف الحيوية التفاعلي المحسّن
- `LivenessResultsDisplay.tsx` - عرض نتائج التحليل بشكل مفصل
- `LivenessVerification.tsx` - صفحة التحقق الكاملة

#### Hooks المخصصة
- `useLivenessDetection()` - hook لإدارة كشف الحركات والحيوية

#### تقنيات المستخدمة
- MediaPipe Face Landmarker للكشف عن معالم الوجه
- تحليل حركات العينين والرأس والابتسامة
- تسجيل الفيديو باستخدام MediaRecorder API

## سير العمل

### 1. بدء الجلسة
```
المستخدم → ابدأ التحقق → startSession tRPC → إنشاء جلسة في DB
```

### 2. كشف الحيوية
```
المستخدم → تفعيل الكاميرا → MediaPipe يكتشف الحركات → تسجيل الفيديو
```

### 3. الرفع والتحليل
```
الفيديو → رفع إلى /api/upload → تخزين في S3 → submitVideo tRPC
→ LLM Vision API يحلل الفيديو → حساب النتائج → تحديث DB
```

### 4. عرض النتائج
```
النتائج → LivenessResultsDisplay → عرض درجات وتحذيرات
```

## التحديات المدعومة

1. **رمش العينين (Eye Blink)**
   - الكشف: حساب Eye Aspect Ratio (EAR)
   - المتطلب: 3 رمشات واضحة

2. **الابتسامة (Smile)**
   - الكشف: حساب نسبة ارتفاع الفم إلى عرضه
   - المتطلب: ابتسامة طبيعية واضحة

3. **تحريك الرأس (Head Turn)**
   - الكشف: حساب زاوية تحريك الرأس
   - المتطلب: تحريك الرأس لليمين واليسار

4. **إيماءة الرأس (Head Nod)**
   - الكشف: حساب pitch الرأس
   - المتطلب: إيماءة رأس واضحة

5. **النظر لأعلى (Look Up)**
   - الكشف: حساب pitch الرأس لأعلى
   - المتطلب: النظر لأعلى بوضوح

## معايير النجاح

- **درجة الحيوية**: يجب أن تكون ≥ 75/100
- **درجة المخاطرة**: يجب أن تكون ≤ 25/100
- **عدم اكتشاف هجوم**: لا يجب اكتشاف محاولة تزييف

## كشف الهجمات (Presentation Attack Detection)

النظام يكتشف:
- صور مطبوعة (Print Attack)
- تشغيل فيديو مسجل (Video Replay)
- أقنعة (Mask Attack)
- تزييف عميق (Deepfake)
- حقن (Injection Attack)

## المتطلبات البيئية

### متغيرات البيئة المطلوبة
```
BUILT_IN_FORGE_API_URL=<storage_api_url>
BUILT_IN_FORGE_API_KEY=<storage_api_key>
```

### المكتبات المثبتة
- `@mediapipe/tasks-vision` - كشف معالم الوجه
- `multer` - معالجة رفع الملفات
- `express` - خادم الويب

## الاستخدام

### من جانب المستخدم
1. الذهاب إلى `/liveness`
2. النقر على "ابدأ التحقق الآن"
3. السماح بالوصول للكاميرا
4. إجراء التحديات المطلوبة
5. الانتظار لتحليل النتائج

### من جانب المطور
```typescript
// استيراد المكون
import LivenessVerificationPage from '@/pages/LivenessVerification';

// استخدام الـ tRPC endpoints
const { data: status } = trpc.liveness.getStatus.useQuery();
const mutation = trpc.liveness.startSession.useMutation();
```

## الأداء والتحسينات

### تحسينات الأداء
- استخدام `requestAnimationFrame` لكشف سلس
- معالجة الفيديو بدقة 640x480
- تخزين الفيديو في الذاكرة قبل الرفع

### تحسينات الدقة
- حساب متقدم لـ Eye Aspect Ratio
- كشف متعدد الإطارات للحركات
- تحليل LLM Vision للتحقق النهائي

## الأمان والخصوصية

- جميع البيانات مشفرة أثناء النقل والتخزين
- الفيديو يتم حذفه تلقائياً بعد التحليل
- لا يتم تخزين بيانات الوجه الخام
- متوافق مع GDPR ومعايير الخصوصية

## معايير الامتثال

- ISO 30107-3: معايير كشف هجمات العرض
- NIST SP 800-63-3: معايير المصادقة البيومترية
- GDPR: معايير حماية البيانات الشخصية

## استكشاف الأخطاء

### المشاكل الشائعة

1. **فشل الوصول للكاميرا**
   - تحقق من أذونات المتصفح
   - استخدم HTTPS في الإنتاج

2. **عدم اكتشاف الوجه**
   - تأكد من الإضاءة الجيدة
   - ضع وجهك مباشرة أمام الكاميرا
   - تأكد من وضوح الكاميرا

3. **فشل الرفع**
   - تحقق من اتصال الإنترنت
   - تأكد من حجم الملف < 100MB
   - تحقق من متغيرات البيئة للتخزين

## الخطوات التالية

1. اختبار شامل للنظام
2. تحسين دقة الكشف
3. إضافة دعم لغات أخرى
4. تطوير تطبيق موبايل
5. إضافة تحليلات متقدمة

## المراجع

- [MediaPipe Face Landmarker](https://developers.google.com/mediapipe/solutions/vision/face_landmarker)
- [ISO 30107-3 Standard](https://www.iso.org/standard/70853.html)
- [NIST Biometric Guidelines](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-63-3.pdf)
