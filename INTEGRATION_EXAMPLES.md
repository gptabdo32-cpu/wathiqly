# أمثلة التكامل مع خدمات OCR ومطابقة الوجه

هذا الملف يوفر أمثلة عملية لدمج خدمات OCR ومطابقة الوجه الحقيقية مع نظام التحقق من الهوية.

---

## 1. دمج Google Vision API لـ OCR

### الخطوة 1: التثبيت

```bash
npm install @google-cloud/vision
```

### الخطوة 2: إنشاء خدمة OCR

```typescript
// server/_core/ocr.ts
import vision from "@google-cloud/vision";

const client = new vision.ImageAnnotatorClient({
  keyFilename: process.env.GOOGLE_CLOUD_KEY_FILE,
});

export async function extractIdData(imageBuffer: Buffer) {
  const request = {
    image: { content: imageBuffer },
  };

  const [result] = await client.textDetection(request);
  const detections = result.textAnnotations;

  if (!detections || detections.length === 0) {
    throw new Error("No text detected in image");
  }

  // Parse the extracted text to find ID number and name
  const fullText = detections[0].description;
  
  // This is a simplified example - actual parsing would be more complex
  const nationalIdNumber = extractIdNumber(fullText);
  const fullName = extractFullName(fullText);

  return { nationalIdNumber, fullName };
}

function extractIdNumber(text: string): string {
  // Implement logic to extract ID number from text
  const match = text.match(/\d{13}/); // Example for 13-digit ID
  return match ? match[0] : "";
}

function extractFullName(text: string): string {
  // Implement logic to extract full name from text
  const lines = text.split("\n");
  return lines[0] || "";
}
```

### الخطوة 3: استخدام الخدمة في API

```typescript
// في server/routers/verification.ts
import { extractIdData } from "../_core/ocr";

uploadId: protectedProcedure
  .input(z.object({
    idCardImageBase64: z.string(),
  }))
  .mutation(async ({ ctx, input }) => {
    const { db, user } = ctx;
    const { idCardImageBase64 } = input;

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(idCardImageBase64, 'base64');

    // Use Google Vision API to extract data
    const { nationalIdNumber, fullName } = await extractIdData(imageBuffer);

    // Rest of the code...
  }),
```

---

## 2. دمج AWS Rekognition لمطابقة الوجه

### الخطوة 1: التثبيت

```bash
npm install @aws-sdk/client-rekognition
```

### الخطوة 2: إنشاء خدمة مطابقة الوجه

```typescript
// server/_core/faceRecognition.ts
import {
  RekognitionClient,
  CompareFacesCommand,
} from "@aws-sdk/client-rekognition";

const rekognitionClient = new RekognitionClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function compareFaces(
  idCardImageBuffer: Buffer,
  selfieImageBuffer: Buffer,
  similarityThreshold: number = 90
): Promise<number> {
  const params = {
    SourceImage: {
      Bytes: idCardImageBuffer,
    },
    TargetImage: {
      Bytes: selfieImageBuffer,
    },
    SimilarityThreshold: similarityThreshold,
  };

  try {
    const command = new CompareFacesCommand(params);
    const response = await rekognitionClient.send(command);

    if (response.FaceMatches && response.FaceMatches.length > 0) {
      const similarity = response.FaceMatches[0].Similarity || 0;
      return Math.round(similarity);
    }

    return 0; // No match found
  } catch (error) {
    console.error("Face comparison error:", error);
    throw new Error("Failed to compare faces");
  }
}

export async function detectLiveness(
  imageBuffer: Buffer
): Promise<boolean> {
  // AWS Rekognition can detect if a face is real or a photo
  const params = {
    Image: {
      Bytes: imageBuffer,
    },
  };

  try {
    const command = new DetectFacesCommand({
      ...params,
      Attributes: ["ALL"],
    });
    const response = await rekognitionClient.send(command);

    if (response.FaceDetails && response.FaceDetails.length > 0) {
      const face = response.FaceDetails[0];
      // Check if face has eyes open and mouth closed (basic liveness check)
      return (face.EyesOpen?.Value || false) && !(face.MouthOpen?.Value || false);
    }

    return false;
  } catch (error) {
    console.error("Liveness detection error:", error);
    throw new Error("Failed to detect liveness");
  }
}
```

### الخطوة 3: استخدام الخدمة في API

```typescript
// في server/routers/verification.ts
import { compareFaces, detectLiveness } from "../_core/faceRecognition";

faceMatch: protectedProcedure
  .mutation(async ({ ctx }) => {
    const { db, user } = ctx;

    const currentUser = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!currentUser || !currentUser[0].identityDocumentUrl || !currentUser[0].selfieImageUrl) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "ID card image or selfie image not found.",
      });
    }

    // Download images from storage
    const idCardImage = await downloadImage(currentUser[0].identityDocumentUrl);
    const selfieImage = await downloadImage(currentUser[0].selfieImageUrl);

    // Compare faces using AWS Rekognition
    const faceMatchScore = await compareFaces(idCardImage, selfieImage);

    // Check liveness
    const isLive = await detectLiveness(selfieImage);

    let identityVerified = false;
    let verificationLevel = currentUser[0].verificationLevel;

    if (faceMatchScore >= 90 && isLive) {
      identityVerified = true;
      verificationLevel = 3;
    }

    await db.update(users).set({
      faceMatchScore: faceMatchScore,
      isIdentityVerified: identityVerified,
      identityVerifiedAt: identityVerified ? new Date() : null,
      verificationLevel: verificationLevel,
    }).where(eq(users.id, user.id));

    return { success: true, score: faceMatchScore, isVerified: identityVerified };
  }),
```

---

## 3. دمج Twilio لإرسال SMS

### الخطوة 1: التثبيت

```bash
npm install twilio
```

### الخطوة 2: تحديث خدمة SMS

```typescript
// server/_core/utils.ts
import twilio from "twilio";

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export async function sendSMS(phoneNumber: string, message: string): Promise<void> {
  try {
    await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber,
    });
  } catch (error) {
    console.error("SMS sending error:", error);
    throw new Error("Failed to send SMS");
  }
}
```

### الخطوة 3: متغيرات البيئة المطلوبة

```env
# .env
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# Google Cloud
GOOGLE_CLOUD_KEY_FILE=/path/to/google-cloud-key.json

# AWS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
```

---

## 4. دمج Face++ لمطابقة الوجه المتقدمة

### الخطوة 1: التثبيت

```bash
npm install axios
```

### الخطوة 2: إنشاء خدمة Face++

```typescript
// server/_core/facepp.ts
import axios from "axios";
import FormData from "form-data";

const FACEPP_API_KEY = process.env.FACEPP_API_KEY;
const FACEPP_API_SECRET = process.env.FACEPP_API_SECRET;

export async function compareFacesWithFacepp(
  idCardImageBuffer: Buffer,
  selfieImageBuffer: Buffer
): Promise<number> {
  try {
    // Detect face in ID card
    const idFaceSet = await detectFace(idCardImageBuffer);
    if (!idFaceSet.face_token) {
      throw new Error("No face detected in ID card");
    }

    // Detect face in selfie
    const selfieFaceSet = await detectFace(selfieImageBuffer);
    if (!selfieFaceSet.face_token) {
      throw new Error("No face detected in selfie");
    }

    // Compare faces
    const response = await axios.post(
      "https://api-us.faceplusplus.com/facepp/v3/compare",
      {
        face_token1: idFaceSet.face_token,
        face_token2: selfieFaceSet.face_token,
        api_key: FACEPP_API_KEY,
        api_secret: FACEPP_API_SECRET,
      }
    );

    return Math.round(response.data.confidence);
  } catch (error) {
    console.error("Face++ comparison error:", error);
    throw new Error("Failed to compare faces");
  }
}

async function detectFace(imageBuffer: Buffer): Promise<any> {
  const form = new FormData();
  form.append("image_file", imageBuffer, "image.jpg");
  form.append("api_key", FACEPP_API_KEY);
  form.append("api_secret", FACEPP_API_SECRET);

  const response = await axios.post(
    "https://api-us.faceplusplus.com/facepp/v3/detect",
    form,
    { headers: form.getHeaders() }
  );

  if (response.data.faces && response.data.faces.length > 0) {
    return response.data.faces[0];
  }

  throw new Error("No face detected");
}
```

---

## 5. إضافة Rate Limiting

### الخطوة 1: التثبيت

```bash
npm install express-rate-limit redis
```

### الخطوة 2: إنشاء Middleware

```typescript
// server/_core/middleware.ts
import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import redis from "redis";

const redisClient = redis.createClient({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
});

export const verificationLimiter = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: "verification:",
  }),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 attempts per hour
  message: "Too many verification attempts, please try again later.",
});
```

### الخطوة 3: استخدام Middleware

```typescript
// في server/routers/verification.ts
app.post("/api/verify/send-otp", verificationLimiter, async (req, res) => {
  // Handle OTP sending
});
```

---

## 6. إضافة Logging والمراقبة

```typescript
// server/_core/logger.ts
import winston from "winston";

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.File({ filename: "combined.log" }),
  ],
});

// في server/routers/verification.ts
logger.info("User verification started", {
  userId: user.id,
  verificationLevel: user.verificationLevel,
});

logger.error("Face matching failed", {
  userId: user.id,
  score: faceMatchScore,
  error: error.message,
});
```

---

## الخطوات التالية

1. اختر خدمات OCR ومطابقة الوجه المناسبة لاحتياجاتك
2. أضف مفاتيح API والبيانات المطلوبة إلى ملف `.env`
3. اختبر الخدمات محلياً قبل النشر على الإنتاج
4. أضف معالجة الأخطاء الشاملة والتسجيل
5. راقب الأداء والأمان بشكل مستمر
