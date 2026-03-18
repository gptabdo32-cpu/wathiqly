# دليل التكامل - Behavioral Biometrics Integration

## 🔗 التكامل مع الأنظمة الموجودة

### 1. التكامل مع نظام الاحتيال (Fraud Detection)

#### الملف: `server/_core/fraudDetection.ts`

```typescript
// إضافة درجة السلوك إلى تقييم المخاطر
import { assessBehavioralRisk } from './behavioralBiometrics';

export async function assessFraudRisk(
  userId: number,
  ipAddress?: string,
  userAgent?: string
): Promise<FraudRiskAssessment> {
  // ... الكود الموجود ...
  
  // إضافة جديدة: تقييم السلوك
  const behavioralRisk = await assessBehavioralRisk(userId);
  
  if (behavioralRisk.riskScore > 60) {
    flags.push({
      type: "behavioral_anomaly",
      severity: "critical",
      description: `Behavioral pattern mismatch detected (score: ${behavioralRisk.riskScore})`,
      value: behavioralRisk.riskScore,
    });
    riskScore += 30; // إضافة 30 نقطة للمخاطر الإجمالية
  }
  
  // ... باقي الكود ...
}
```

### 2. التكامل مع نظام التحقق من الهوية (Liveness Detection)

#### الملف: `server/routers/liveness.ts`

```typescript
// تفعيل التحقق السلوكي بعد التحقق الحي الناجح
import { behavioralRouter } from './behavioral';

export const livenessRouter = router({
  // ... الإجراءات الموجودة ...
  
  completeLivenessVerification: protectedProcedure
    .input(z.object({
      sessionId: z.string(),
      // ...
    }))
    .mutation(async ({ ctx, input }) => {
      // 1. إكمال التحقق الحي
      const livenessResult = await completeLiveness(input.sessionId);
      
      // 2. تفعيل التحقق السلوكي
      if (livenessResult.isLive) {
        const behavioralStatus = await initializeBehavioralPattern(ctx.user.id);
        
        return {
          success: true,
          livenessVerified: true,
          behavioralMonitoringActive: true,
          message: "تم التحقق بنجاح. سيتم مراقبة نمط استخدامك للأمان الإضافي",
        };
      }
      
      return { success: false };
    }),
});
```

### 3. التكامل مع نظام الثقة (Trust System)

#### الملف: `server/routers/trust.ts`

```typescript
// استخدام درجة السلوك في حساب درجة الثقة
import { getBehavioralTrustScore } from '../_core/behavioralBiometrics';

export const trustRouter = router({
  getTrustProfile: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ ctx, input }) => {
      // ... الكود الموجود ...
      
      // إضافة جديدة: درجة السلوك
      const behavioralScore = await getBehavioralTrustScore(input.userId);
      
      const trustProfile = {
        // ... البيانات الموجودة ...
        behavioralTrustScore: behavioralScore, // 0-100
        securityLevel: behavioralScore > 80 ? 'high' : 'medium',
      };
      
      return trustProfile;
    }),
});
```

### 4. التكامل مع لوحة تحكم المسؤول (Admin Dashboard)

#### الملف: `server/routers/admin.ts`

```typescript
// إضافة إحصائيات السلوك إلى لوحة التحكم
import { getBehavioralStatistics } from '../_core/behavioralBiometrics';

export const adminRouter = router({
  // ... الإجراءات الموجودة ...
  
  getSecurityMetrics: protectedProcedure
    .query(async ({ ctx }) => {
      // تحقق من صلاحيات المسؤول
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      
      const behavioralStats = await getBehavioralStatistics();
      
      return {
        fraudDetection: { /* ... */ },
        livenessDetection: { /* ... */ },
        behavioralBiometrics: {
          totalPatterns: behavioralStats.totalPatterns,
          lockedAccounts: behavioralStats.lockedAccounts,
          suspiciousSessions: behavioralStats.suspiciousSessions,
          averageSimilarityScore: behavioralStats.avgScore,
        },
      };
    }),
});
```

---

## 🔄 سير العمل المتكامل

### 1. تسجيل دخول جديد

```
┌─────────────────────────────────────────────────────────────┐
│ 1. المستخدم يسجل الدخول                                    │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. فحص بيانات المصادقة (OAuth)                             │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. تقييم مخاطر الاحتيال (Fraud Detection)                  │
│    • فحص IP                                                │
│    • فحص الجهاز                                            │
│    • فحص السلوك (جديد)                                     │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
        ┌────────────────┐
        │ المخاطر عالية؟ │
        └────────┬───────┘
                 │
        ┌────────┴────────┐
        │                 │
       نعم               لا
        │                 │
        ▼                 ▼
   [طلب تحقق]    [السماح بالدخول]
        │                 │
        ▼                 ▼
   [Liveness]     [بدء المراقبة]
        │                 │
        ▼                 ▼
   [تفعيل السلوك]  [جمع البيانات]
```

### 2. أثناء الاستخدام

```
┌─────────────────────────────────────────────────────────────┐
│ المستخدم يستخدم التطبيق                                    │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ جمع بيانات السلوك (في الخلفية)                             │
│ • الكتابة                                                  │
│ • التمرير                                                  │
│ • اتجاه الجهاز                                             │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ كل 30 ثانية: إرسال البيانات للخادم                        │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ الخادم: مقارنة مع الملف المرجعي                           │
└────────────────┬────────────────────────────────────────────┘
                 │
        ┌────────┴────────┐
        │                 │
    تطابق جيد         عدم تطابق
        │                 │
        ▼                 ▼
   [متابعة]        [تحذير]
                        │
                        ▼
                   [محاولات متكررة؟]
                        │
                   ┌────┴────┐
                   │          │
                  نعم        لا
                   │          │
                   ▼          ▼
              [قفل الحساب] [مراقبة]
```

---

## 📊 البيانات المشتركة

### جدول المقارنة: البيانات بين الأنظمة

| النظام | البيانات المرسلة | البيانات المستقبلة |
|--------|-----------------|-------------------|
| **Fraud Detection** | userId, ipAddress | riskScore |
| **Liveness Detection** | userId, sessionId | livenessVerified |
| **Trust System** | userId | trustScore |
| **Admin Dashboard** | - | statistics |
| **Behavioral** | sessionData | similarityScore |

---

## 🔐 الأمان والخصوصية

### 1. التحقق من الصلاحيات

```typescript
// في كل نقطة نهاية، تحقق من الصلاحيات
protectedProcedure // يتطلب تسجيل دخول
  .input(schema)
  .mutation(async ({ ctx, input }) => {
    // ctx.user متوفر فقط للمستخدمين المسجلين
    if (!ctx.user) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }
    
    // تحقق من أن المستخدم يعديل بيانات نفسه فقط
    if (input.userId !== ctx.user.id) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
  });
```

### 2. تشفير البيانات

```typescript
// تشفير البيانات الحساسة قبل التخزين
import { encryptData } from '../_core/encryption';

const encryptedData = encryptData(JSON.stringify(sessionData));
await db.insert(behavioralSessionsTable).values({
  sessionData: encryptedData, // مشفر
  // ...
});
```

### 3. تسجيل الأنشطة (Audit Logging)

```typescript
// تسجيل جميع الأنشطة الأمنية
import { createAuditLog } from '../db-enhanced';

await createAuditLog({
  userId: ctx.user.id,
  action: 'behavioral_pattern_locked',
  entityType: 'behavioral_pattern',
  entityId: patternId,
  newValue: { isLocked: true },
  ipAddress: ctx.req.ip,
  userAgent: ctx.req.headers['user-agent'],
});
```

---

## 🧪 الاختبار المتكامل

### 1. اختبار التدفق الكامل

```typescript
describe('Integrated Security Flow', () => {
  it('should lock account after behavioral mismatch', async () => {
    // 1. إنشاء مستخدم
    const user = await createTestUser();
    
    // 2. بناء الملف الشخصي
    await submitBehavioralSession(user.id, normalBehavior);
    
    // 3. محاولة مشبوهة
    const suspiciousResult = await submitBehavioralSession(user.id, suspiciousBehavior);
    expect(suspiciousResult.status).toBe('locked');
    
    // 4. التحقق من أن الحساب مقفول
    const pattern = await getBehavioralPattern(user.id);
    expect(pattern.isLocked).toBe(true);
    
    // 5. التحقق من تقييم المخاطر
    const fraudRisk = await assessFraudRisk(user.id);
    expect(fraudRisk.riskLevel).toBe('critical');
  });
});
```

### 2. اختبار الأداء

```typescript
describe('Performance', () => {
  it('should handle 1000 concurrent sessions', async () => {
    const sessions = Array.from({ length: 1000 }, (_, i) => ({
      userId: i + 1,
      sessionData: generateMockData(),
    }));
    
    const startTime = Date.now();
    await Promise.all(sessions.map(s => submitBehavioralSession(s.userId, s.sessionData)));
    const duration = Date.now() - startTime;
    
    expect(duration).toBeLessThan(5000); // أقل من 5 ثوان
  });
});
```

---

## 📈 المراقبة والتقارير

### 1. لوحة تحكم المسؤول

```typescript
// عرض إحصائيات السلوك
GET /api/admin/behavioral-stats

Response: {
  totalPatterns: 5000,
  lockedAccounts: 42,
  suspiciousSessions: 156,
  averageSimilarityScore: 87.5,
  topAnomalies: [
    { userId: 123, reason: 'typing_speed_anomaly', score: 15 },
    // ...
  ]
}
```

### 2. تنبيهات فورية

```typescript
// إرسال تنبيهات للمسؤولين
if (similarityScore < 30 && pattern.sampleCount > 10) {
  await sendAlert({
    type: 'BEHAVIORAL_ANOMALY',
    severity: 'CRITICAL',
    userId: userId,
    message: `Account ${userId} locked due to behavioral mismatch`,
    timestamp: new Date(),
  });
}
```

---

## 🔄 التحديثات المستقبلية

### المرحلة التالية (v1.1)
- [ ] تحليل حركة الماوس
- [ ] تحليل نمط اللمس
- [ ] تكامل مع ML models

### المرحلة الثالثة (v1.2)
- [ ] واجهة مستخدم متقدمة
- [ ] تقارير مفصلة
- [ ] إعدادات قابلة للتخصيص

---

## 📞 الدعم الفني

للمساعدة في التكامل:
- 📧 dev-support@wathiqly.com
- 📚 Documentation: https://docs.wathiqly.com
- 💬 Slack: #security-team

---

**آخر تحديث**: مارس 2026
**الإصدار**: 1.0.0
