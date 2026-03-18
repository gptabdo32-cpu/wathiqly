# نظام كشف الحيوية التفاعلي - دليل شامل

## نظرة عامة

**Interactive Liveness Detection System** هو نظام أمني متقدم يتحقق من أن المستخدم شخص حي وليس صورة أو فيديو مسجل أو تزييف عميق (Deepfake). يستخدم النظام تقنيات متطورة لكشف الحركات الطبيعية والاستجابات الفيزيولوجية في الوقت الفعلي.

## المميزات الرئيسية

### 1. **كشف الحركات التفاعلية**
- **رمش العينين**: كشف رمش طبيعي متكرر
- **الابتسامة**: كشف تعابير الوجه الطبيعية
- **تحريك الرأس**: كشف الحركات الجانبية
- **إيماءات الرأس**: كشف حركات الموافقة والرفض
- **النظر لأعلى**: كشف حركات النظر المختلفة

### 2. **كشف الهجمات التقديمية (Presentation Attacks)**
- **الصور المطبوعة**: كشف محاولات استخدام صور مطبوعة
- **فيديوهات مسجلة**: كشف محاولات تشغيل فيديو مسجل
- **الأقنعة**: كشف محاولات استخدام أقنعة أو تنكرات
- **التزييف العميق**: كشف محاولات استخدام تقنيات Deepfake
- **حقن الفيديو**: كشف محاولات حقن محتوى خارجي

### 3. **تحليل فيزيولوجي متقدم**
- **انعكاس الضوء على القرنية**: تحليل الضوء المنعكس من العينين
- **تمدد الجلد**: كشف الحركات الطبيعية للجلد
- **نسيج الجلد**: تحليل نسيج الجلد الطبيعي
- **تحليل التردد**: تحليل الترددات الطبيعية للوجه

## البنية المعمارية

### المكونات الرئيسية

```
┌─────────────────────────────────────────────────────────┐
│                   الواجهة الأمامية (Frontend)           │
│            LivenessDetectionEnhanced Component          │
│  - التقاط الفيديو من الكاميرا                          │
│  - عرض التحديات للمستخدم                               │
│  - تسجيل الفيديو                                        │
│  - رفع الفيديو إلى الخادم                               │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                   API Endpoint                          │
│              /api/upload (POST)                         │
│  - استقبال الفيديو                                     │
│  - التحقق من صحة الملف                                 │
│  - تخزين الفيديو في S3                                 │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                   tRPC Router                           │
│          liveness.submitVideo Procedure                 │
│  - التحقق من الجلسة                                    │
│  - استدعاء محرك التحليل                                │
│  - حفظ النتائج في قاعدة البيانات                       │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│              محرك التحليل (Analysis Engine)            │
│         analyzeVideoForLiveness Function                │
│  - التحقق من صحة الفيديو                               │
│  - استدعاء LLM Vision API                              │
│  - تحليل التحديات                                      │
│  - كشف الهجمات التقديمية                               │
│  - حساب درجات الثقة                                    │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                   قاعدة البيانات                        │
│  - جداول الجلسات                                       │
│  - جداول النتائج                                       │
│  - جداول سجلات الهجمات                                 │
│  - جداول إحصائيات المستخدمين                           │
└─────────────────────────────────────────────────────────┘
```

## تدفق العمل

### 1. **بدء جلسة التحقق**

```typescript
// الطلب
const session = await trpc.liveness.startSession.mutate({
  challengeCount: 3, // عدد التحديات (1-6)
});

// الاستجابة
{
  sessionId: "unique-session-id",
  challenges: ["eye_blink", "smile", "head_nod"],
  expiresAt: "2026-03-18T02:00:00Z",
  message: "Liveness detection session started"
}
```

### 2. **التقاط الفيديو والتحديات**

- يتم عرض تحديات عشوائية للمستخدم
- يقوم المستخدم بتنفيذ التحديات أمام الكاميرا
- يتم تسجيل الفيديو لمدة 60 ثانية
- يتم كشف التحديات المكتملة في الوقت الفعلي

### 3. **رفع الفيديو والتحليل**

```typescript
// الطلب
const result = await trpc.liveness.submitVideo.mutate({
  sessionId: "unique-session-id",
  videoUrl: "https://storage.example.com/liveness/video.webm",
  videoDuration: 45000, // بالميلي ثانية
});

// الاستجابة
{
  sessionId: "unique-session-id",
  success: true,
  livenessScore: 88,
  riskScore: 12,
  isLive: true,
  challenges: [
    { challenge: "eye_blink", detected: true, confidence: 92 },
    { challenge: "smile", detected: true, confidence: 85 },
    { challenge: "head_nod", detected: true, confidence: 88 }
  ],
  presentationAttackDetected: false,
  warnings: [],
  message: "Liveness verification successful!"
}
```

## جداول قاعدة البيانات

### 1. **liveness_sessions**

| العمود | النوع | الوصف |
|-------|-------|-------|
| id | INT | المعرف الأساسي |
| userId | INT | معرف المستخدم |
| sessionId | VARCHAR(64) | معرف الجلسة الفريد |
| status | ENUM | حالة الجلسة (pending, in_progress, completed, failed) |
| challenges | TEXT | قائمة التحديات (JSON) |
| completedChallenges | TEXT | التحديات المكتملة (JSON) |
| videoUrl | TEXT | رابط الفيديو المرفوع |
| videoDuration | INT | مدة الفيديو بالميلي ثانية |
| livenessScore | INT | درجة الحيوية (0-100) |
| riskScore | INT | درجة المخاطرة (0-100) |
| isLive | BOOLEAN | هل تم التحقق من الحيوية |
| analysisResults | TEXT | نتائج التحليل التفصيلية (JSON) |
| startedAt | TIMESTAMP | وقت بدء الجلسة |
| completedAt | TIMESTAMP | وقت انتهاء الجلسة |

### 2. **liveness_analysis_results**

| العمود | النوع | الوصف |
|-------|-------|-------|
| id | INT | المعرف الأساسي |
| sessionId | VARCHAR(64) | معرف الجلسة |
| frameNumber | INT | رقم الإطار |
| timestamp | INT | الوقت بالميلي ثانية |
| eyeBlinkDetected | BOOLEAN | هل تم كشف رمش العينين |
| eyeAspectRatio | DECIMAL | نسبة العينين |
| smileDetected | BOOLEAN | هل تم كشف الابتسامة |
| headYaw | DECIMAL | زاوية الرأس الأفقية |
| headPitch | DECIMAL | زاوية الرأس العمودية |
| corneaReflectionDetected | BOOLEAN | هل تم كشف انعكاس الضوء |
| skinDistortionScore | DECIMAL | درجة تشوه الجلد |
| frameScore | DECIMAL | درجة الإطار الكلية |

### 3. **presentation_attack_logs**

| العمود | النوع | الوصف |
|-------|-------|-------|
| id | INT | المعرف الأساسي |
| sessionId | VARCHAR(64) | معرف الجلسة |
| printAttackDetected | BOOLEAN | هل تم كشف هجوم الصور المطبوعة |
| videoReplayDetected | BOOLEAN | هل تم كشف هجوم الفيديو المسجل |
| maskAttackDetected | BOOLEAN | هل تم كشف هجوم الأقنعة |
| deepfakeDetected | BOOLEAN | هل تم كشف هجوم التزييف العميق |
| overallRiskScore | DECIMAL | درجة المخاطرة الكلية |
| isPresentationAttack | BOOLEAN | هل هذا هجوم تقديمي |
| confidence | DECIMAL | درجة الثقة |

## معايير التحقق

### درجة الحيوية (Liveness Score)

- **90-100**: ممتاز - ثقة عالية جداً في أن المستخدم حي
- **75-89**: جيد - ثقة عالية في أن المستخدم حي
- **60-74**: متوسط - ثقة متوسطة
- **أقل من 60**: ضعيف - ثقة منخفضة

### درجة المخاطرة (Risk Score)

- **0-25**: آمن جداً - احتمال منخفض جداً لهجوم
- **26-50**: متوسط - احتمال متوسط لهجوم
- **51-75**: مرتفع - احتمال مرتفع لهجوم
- **76-100**: خطير جداً - احتمال مرتفع جداً لهجوم

### معايير النجاح

يعتبر التحقق من الحيوية **ناجحاً** إذا:
- درجة الحيوية ≥ 75
- درجة المخاطرة ≤ 25
- لم يتم كشف أي هجوم تقديمي
- تم إكمال جميع التحديات المطلوبة

## واجهات برمجية (APIs)

### 1. **POST /api/upload**

رفع فيديو الحيوية

**الطلب:**
```bash
curl -X POST http://localhost:3000/api/upload \
  -F "file=@liveness-video.webm" \
  -H "x-trpc-source: client"
```

**الاستجابة:**
```json
{
  "success": true,
  "url": "https://storage.example.com/liveness/video.webm",
  "key": "liveness/1710747600000-abc123.webm",
  "fileId": "abc123"
}
```

### 2. **tRPC: liveness.startSession**

بدء جلسة تحقق جديدة

```typescript
const session = await trpc.liveness.startSession.mutate({
  challengeCount: 3,
});
```

### 3. **tRPC: liveness.submitVideo**

إرسال الفيديو للتحليل

```typescript
const result = await trpc.liveness.submitVideo.mutate({
  sessionId: "session-id",
  videoUrl: "https://storage.example.com/video.webm",
  videoDuration: 45000,
});
```

### 4. **tRPC: liveness.getSessionStatus**

الحصول على حالة الجلسة

```typescript
const status = await trpc.liveness.getSessionStatus.query({
  sessionId: "session-id",
});
```

### 5. **tRPC: liveness.getHistory**

الحصول على سجل التحقق

```typescript
const history = await trpc.liveness.getHistory.query({
  limit: 10,
});
```

### 6. **tRPC: liveness.getStats**

الحصول على إحصائيات المستخدم

```typescript
const stats = await trpc.liveness.getStats.query();
```

## معالجة الأخطاء

### أخطاء شائعة

| الخطأ | السبب | الحل |
|------|------|------|
| `Session not found` | الجلسة منتهية أو غير موجودة | ابدأ جلسة جديدة |
| `Invalid video URL` | رابط الفيديو غير صحيح | تأكد من رفع الفيديو بنجاح |
| `Video validation failed` | الفيديو غير متاح أو ليس فيديو | تأكد من صحة الفيديو |
| `Failed to analyze video` | خطأ في التحليل | حاول مرة أخرى |
| `Liveness verification failed` | درجة الحيوية منخفضة | حاول مرة أخرى بطريقة أفضل |

## الأمان والخصوصية

### تشفير البيانات

- جميع الفيديوهات مشفرة أثناء النقل (HTTPS/TLS)
- جميع البيانات الحساسة مشفرة في قاعدة البيانات
- استخدام معايير التشفير الدولية (AES-256)

### حذف البيانات

- الفيديوهات يتم حذفها تلقائياً بعد 7 أيام من التحليل
- يمكن للمستخدم طلب حذف بيانات الجلسة في أي وقت
- البيانات الشخصية محمية وفقاً للقوانين الدولية

### الامتثال

- متوافق مع معايير **ISO 30107-3** (Presentation Attack Detection)
- متوافق مع معايير **NIST** للتحقق البيومتري
- متوافق مع **GDPR** و**CCPA** لحماية البيانات

## الاختبار

### تشغيل الاختبارات

```bash
# تشغيل جميع الاختبارات
npm test server/liveness.test.ts

# تشغيل اختبار محدد
npm test server/liveness.test.ts -t "Challenge Generation"

# تشغيل مع التفاصيل
npm test server/liveness.test.ts --reporter=verbose
```

### حالات الاختبار

1. **توليد التحديات**: التحقق من توليد تحديات عشوائية بدون تكرار
2. **إنشاء الجلسة**: التحقق من إنشاء جلسة صحيحة مع معرف فريد
3. **حساب درجات المخاطرة**: التحقق من حساب درجات المخاطرة بشكل صحيح
4. **التحقق من النتائج**: التحقق من التحقق الصحيح من نتائج التحليل
5. **معالجة الأخطاء**: التحقق من معالجة الأخطاء بشكل صحيح

## الأداء والتحسينات

### معايير الأداء

- **وقت الرفع**: أقل من 5 ثواني لفيديو 60 ثانية
- **وقت التحليل**: أقل من 30 ثانية
- **الوقت الإجمالي**: أقل من 35 ثانية

### التحسينات المستقبلية

1. **معالجة متوازية**: معالجة عدة فيديوهات في نفس الوقت
2. **ضغط الفيديو**: ضغط الفيديو قبل الرفع لتقليل الحجم
3. **تخزين مؤقت**: تخزين نتائج التحليل مؤقتاً لتسريع الاستجابة
4. **تعلم آلي محسّن**: تحسين نموذج التعلم الآلي بناءً على البيانات الجديدة
5. **دعم اللغات**: إضافة دعم لغات أخرى

## الدعم والمساعدة

### الأسئلة الشائعة

**س: كم مرة يمكنني محاولة التحقق؟**
ج: يمكنك محاولة التحقق عدة مرات بدون حد، لكن يتم تسجيل جميع المحاولات.

**س: هل الفيديو يتم حفظه؟**
ج: الفيديو يتم حفظه مؤقتاً لمدة 7 أيام ثم يتم حذفه تلقائياً.

**س: هل يمكن استخدام فيديو مسجل؟**
ج: لا، النظام يكتشف الفيديوهات المسجلة ويرفضها.

**س: ما هي أفضل طريقة للتحقق؟**
ج: تأكد من إضاءة جيدة، ضع وجهك مباشرة أمام الكاميرا، وقم بالحركات ببطء وبشكل واضح.

### الاتصال

للإبلاغ عن مشاكل أو اقتراحات:
- البريد الإلكتروني: support@wathiqly.com
- الموقع: https://wathiqly.com/support

## المراجع

- [MediaPipe Face Landmarker](https://developers.google.com/mediapipe/solutions/vision/face_landmarker)
- [ISO 30107-3 Standard](https://www.iso.org/standard/73427.html)
- [NIST Biometric Standards](https://www.nist.gov/programs/biometric-standards)
- [OpenAI Vision API](https://platform.openai.com/docs/guides/vision)

---

**آخر تحديث**: 18 مارس 2026
**الإصدار**: 1.0.0
