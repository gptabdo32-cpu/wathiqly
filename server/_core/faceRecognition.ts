/**
 * Face Recognition Service - Compare faces from ID card and selfie
 * Uses Gemini Vision API for advanced face comparison and liveness detection
 */

import { invokeLLM } from "./llm";
import { TRPCError } from "@trpc/server";

export interface FaceComparisonResult {
  matchScore: number; // 0-100
  isMatch: boolean; // true if score >= 90
  confidence: number; // 0-100 confidence in the comparison
  livenessScore?: number; // 0-100 liveness detection score
  isLive?: boolean; // true if liveness >= 80
  details: {
    facialFeaturesMatch: boolean;
    skinToneMatch: boolean;
    faceShapeMatch: boolean;
    eyePositionMatch: boolean;
    noseShapeMatch: boolean;
    mouthShapeMatch: boolean;
  };
  warnings: string[];
}

/**
 * Compare two face images (ID card and selfie) for identity verification
 * @param idCardImageUrl - URL of the ID card image
 * @param selfieImageUrl - URL of the selfie image
 * @returns Face comparison result with match score and confidence
 */
export async function compareFaces(
  idCardImageUrl: string,
  selfieImageUrl: string
): Promise<FaceComparisonResult> {
  try {
    // Validate image URLs
    if (!idCardImageUrl || !idCardImageUrl.startsWith("http")) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Invalid ID card image URL",
      });
    }

    if (!selfieImageUrl || !selfieImageUrl.startsWith("http")) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Invalid selfie image URL",
      });
    }

    // Call Gemini Vision API for face comparison
    const response = await invokeLLM({
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "أنت متخصص في التحقق من الهوية ومقارنة الوجوه. لديك صورتان: الأولى من بطاقة هوية والثانية سيلفي حديث.",
            },
            {
              type: "image_url",
              image_url: {
                url: idCardImageUrl,
                detail: "high",
              },
            },
            {
              type: "image_url",
              image_url: {
                url: selfieImageUrl,
                detail: "high",
              },
            },
            {
              type: "text",
              text: `يرجى إجراء المقارنة التالية:

1. **مطابقة الوجه (Face Matching)**: قارن الوجه في الصورتين وحدد درجة التشابه من 0-100
2. **كشف الحياة (Liveness Detection)**: تحقق من أن الصورة الثانية (السيلفي) تظهر شخصاً حياً وليس صورة أو قناع
3. **تفاصيل المطابقة**: قيّم تطابق الملامح التالية:
   - ملامح الوجه العامة
   - لون البشرة
   - شكل الوجه
   - موضع العيون
   - شكل الأنف
   - شكل الفم

4. **التحذيرات**: حدد أي مشاكل محتملة مثل:
   - إضاءة سيئة
   - جودة صورة منخفضة
   - زوايا مختلفة جداً
   - علامات تحرير أو تزييف

يجب أن تكون النتيجة بصيغة JSON مع درجات ثقة عالية.
الرد يجب أن يكون بصيغة JSON فقط بدون أي نصوص إضافية.`,
            },
          ],
        },
      ],
      outputSchema: {
        name: "face_comparison",
        schema: {
          type: "object",
          properties: {
            matchScore: {
              type: "number",
              description: "درجة تطابق الوجه من 0 إلى 100",
              minimum: 0,
              maximum: 100,
            },
            confidence: {
              type: "number",
              description: "درجة الثقة في المقارنة من 0 إلى 100",
              minimum: 0,
              maximum: 100,
            },
            livenessScore: {
              type: "number",
              description: "درجة كشف الحياة من 0 إلى 100",
              minimum: 0,
              maximum: 100,
            },
            facialFeaturesMatch: {
              type: "boolean",
              description: "هل ملامح الوجه متطابقة",
            },
            skinToneMatch: {
              type: "boolean",
              description: "هل لون البشرة متطابق",
            },
            faceShapeMatch: {
              type: "boolean",
              description: "هل شكل الوجه متطابق",
            },
            eyePositionMatch: {
              type: "boolean",
              description: "هل موضع العيون متطابق",
            },
            noseShapeMatch: {
              type: "boolean",
              description: "هل شكل الأنف متطابق",
            },
            mouthShapeMatch: {
              type: "boolean",
              description: "هل شكل الفم متطابق",
            },
            warnings: {
              type: "array",
              items: {
                type: "string",
              },
              description: "قائمة التحذيرات المحتملة",
            },
          },
          required: [
            "matchScore",
            "confidence",
            "facialFeaturesMatch",
            "skinToneMatch",
            "faceShapeMatch",
            "eyePositionMatch",
            "noseShapeMatch",
            "mouthShapeMatch",
            "warnings",
          ],
        },
      },
    });

    // Parse the response
    const content = response.choices[0]?.message?.content;
    if (!content || typeof content !== "string") {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to parse face comparison response",
      });
    }

    // Parse JSON from response
    let comparisonData;
    try {
      comparisonData = JSON.parse(content);
    } catch (e) {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Invalid face comparison response format",
        });
      }
      comparisonData = JSON.parse(jsonMatch[0]);
    }

    // Validate response data
    const matchScore = Math.min(100, Math.max(0, comparisonData.matchScore || 0));
    const confidence = Math.min(100, Math.max(0, comparisonData.confidence || 0));
    const livenessScore = comparisonData.livenessScore ? Math.min(100, Math.max(0, comparisonData.livenessScore)) : undefined;

    // Determine if faces match (threshold: 90%)
    const isMatch = matchScore >= 90;

    // Determine if face is live (threshold: 80%)
    const isLive = livenessScore ? livenessScore >= 80 : undefined;

    // Check for warnings
    const warnings: string[] = comparisonData.warnings || [];

    // Add additional warnings based on scores
    if (matchScore < 70) {
      warnings.push("Face match score is low. Please ensure both images show the same person.");
    }

    if (confidence < 60) {
      warnings.push("Comparison confidence is low. Please retake the selfie with better lighting.");
    }

    if (livenessScore !== undefined && livenessScore < 70) {
      warnings.push("Liveness detection score is low. Please ensure the selfie is a live photo, not a printed image.");
    }

    // Log comparison result (without sensitive data)
    console.log(`[Face Recognition] Comparison result:`, {
      matchScore,
      confidence,
      livenessScore,
      isMatch,
      isLive,
      warningCount: warnings.length,
    });

    return {
      matchScore,
      isMatch,
      confidence,
      livenessScore,
      isLive,
      details: {
        facialFeaturesMatch: comparisonData.facialFeaturesMatch || false,
        skinToneMatch: comparisonData.skinToneMatch || false,
        faceShapeMatch: comparisonData.faceShapeMatch || false,
        eyePositionMatch: comparisonData.eyePositionMatch || false,
        noseShapeMatch: comparisonData.noseShapeMatch || false,
        mouthShapeMatch: comparisonData.mouthShapeMatch || false,
      },
      warnings,
    };
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error;
    }

    console.error("[Face Recognition] Error comparing faces:", error);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to compare faces. Please try again.",
    });
  }
}

/**
 * Validate face comparison result
 * @param result - Face comparison result
 * @returns True if result is valid for verification
 */
export function validateFaceComparison(result: FaceComparisonResult): boolean {
  // Check if match score is acceptable (>= 90%)
  if (result.matchScore < 90) {
    return false;
  }

  // Check if confidence is acceptable (>= 70%)
  if (result.confidence < 70) {
    return false;
  }

  // Check if liveness detection passed (if available)
  if (result.livenessScore !== undefined && result.livenessScore < 80) {
    return false;
  }

  // Check if key facial features match
  const matchedFeatures = [
    result.details.facialFeaturesMatch,
    result.details.faceShapeMatch,
    result.details.eyePositionMatch,
    result.details.noseShapeMatch,
  ].filter(Boolean).length;

  // At least 3 out of 4 key features should match
  if (matchedFeatures < 3) {
    return false;
  }

  return true;
}

/**
 * Get risk score based on face comparison result
 * @param result - Face comparison result
 * @returns Risk score from 0 (low risk) to 100 (high risk)
 */
export function calculateRiskScore(result: FaceComparisonResult): number {
  let riskScore = 0;

  // Low match score = high risk
  if (result.matchScore < 90) {
    riskScore += Math.max(0, 100 - result.matchScore * 1.1);
  }

  // Low confidence = medium risk
  if (result.confidence < 70) {
    riskScore += (100 - result.confidence) * 0.3;
  }

  // Low liveness score = high risk
  if (result.livenessScore !== undefined && result.livenessScore < 80) {
    riskScore += Math.max(0, (100 - result.livenessScore) * 0.5);
  }

  // Warnings = additional risk
  riskScore += Math.min(20, result.warnings.length * 5);

  return Math.min(100, riskScore);
}
