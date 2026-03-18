/**
 * Enhanced Liveness Detection Core Module
 * Optimized for handling compressed videos and faster analysis
 * Implements caching and parallel processing for improved performance
 */

import { nanoid } from "nanoid";
import { invokeLLM } from "./llm";
import { TRPCError } from "@trpc/server";

/**
 * Cache for LLM analysis results to avoid re-processing
 * Maps video URL hash to analysis result
 */
const analysisCache = new Map<string, any>();
const CACHE_TTL = 3600000; // 1 hour in milliseconds

/**
 * Hash a string for cache key
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Get cached analysis result if available
 */
function getCachedAnalysis(videoUrl: string): any | null {
  const key = hashString(videoUrl);
  const cached = analysisCache.get(key);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }

  // Remove expired cache
  if (cached) {
    analysisCache.delete(key);
  }

  return null;
}

/**
 * Cache analysis result
 */
function cacheAnalysis(videoUrl: string, result: any): void {
  const key = hashString(videoUrl);
  analysisCache.set(key, {
    result,
    timestamp: Date.now(),
  });

  // Limit cache size to 100 entries
  if (analysisCache.size > 100) {
    const firstKey = analysisCache.keys().next().value;
    analysisCache.delete(firstKey);
  }
}

/**
 * Validate video URL with timeout
 */
async function validateVideoUrlWithTimeout(
  videoUrl: string,
  timeoutMs: number = 5000
): Promise<void> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(videoUrl, {
      method: "HEAD",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Video not accessible: ${response.status}`);
    }

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("video")) {
      throw new Error("Invalid content type: not a video");
    }
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === "AbortError") {
      throw new TRPCError({
        code: "TIMEOUT",
        message: "Video validation timeout - video server may be slow",
      });
    }

    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Video validation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
}

/**
 * Analyze video for liveness detection with optimizations
 * Includes caching, timeout handling, and parallel processing support
 */
export const analyzeVideoForLivenessEnhanced = async (
  videoUrl: string,
  challenges: string[],
  useCache: boolean = true
): Promise<any> => {
  try {
    // Check cache first
    if (useCache) {
      const cached = getCachedAnalysis(videoUrl);
      if (cached) {
        console.log("[Liveness Detection] Using cached analysis result");
        return cached;
      }
    }

    // Validate video URL with timeout
    if (!videoUrl || !videoUrl.startsWith("http")) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Invalid video URL",
      });
    }

    await validateVideoUrlWithTimeout(videoUrl, 5000);

    // Build challenge descriptions
    const challengeDescriptions = challenges
      .map((c) => {
        const descriptions: Record<string, string> = {
          eye_blink: "رمش العينين 3 مرات",
          smile: "ابتسام طبيعي",
          head_turn_left: "تحريك الرأس لليسار",
          head_turn_right: "تحريك الرأس لليمين",
          head_nod: "إيماءة الرأس (نعم)",
          look_up: "النظر لأعلى",
        };
        return descriptions[c] || c;
      })
      .join(", ");

    // Call LLM Vision API with optimized prompt
    const response = await invokeLLM({
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `أنت متخصص في كشف الحيوية والتحقق من الهوية. قم بتحليل الفيديو التالي بسرعة وكفاءة للتحقق من أن الشخص حي وليس صورة أو قناع أو فيديو مسجل.

التحديات المطلوبة: ${challengeDescriptions}

قدم تحليلاً موجزاً وفعالاً:
1. هل تم اكتشاف كل تحدي؟ (نعم/لا)
2. درجة الثقة لكل تحدي (0-100)
3. هل هناك علامات على هجوم عرض؟ (نعم/لا)
4. درجة المخاطرة الإجمالية (0-100)
5. التحذيرات المهمة فقط

الرد يجب أن يكون بصيغة JSON فقط.`,
            },
            {
              type: "file_url",
              file_url: {
                url: videoUrl,
                mime_type: "video/webm",
              },
            },
          ],
        },
      ],
      outputSchema: {
        name: "liveness_analysis",
        schema: {
          type: "object",
          properties: {
            challengeResults: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  challenge: { type: "string" },
                  detected: { type: "boolean" },
                  confidence: { type: "number", minimum: 0, maximum: 100 },
                },
                required: ["challenge", "detected", "confidence"],
              },
            },
            livenessScore: {
              type: "number",
              minimum: 0,
              maximum: 100,
            },
            presentationAttackDetected: {
              type: "boolean",
            },
            presentationAttackType: {
              type: "string",
            },
            presentationAttackProbability: {
              type: "number",
              minimum: 0,
              maximum: 1,
            },
            riskScore: {
              type: "number",
              minimum: 0,
              maximum: 100,
            },
            warnings: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: [
            "challengeResults",
            "livenessScore",
            "presentationAttackDetected",
            "riskScore",
            "warnings",
          ],
        },
      },
    });

    // Parse response
    const content = response.choices[0]?.message?.content;
    if (!content || typeof content !== "string") {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to parse liveness analysis response",
      });
    }

    let analysisData;
    try {
      analysisData = JSON.parse(content);
    } catch (e) {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Invalid liveness analysis response format",
        });
      }
      analysisData = JSON.parse(jsonMatch[0]);
    }

    // Calculate final liveness score
    const detectedChallenges = analysisData.challengeResults.filter(
      (r: { detected: boolean }) => r.detected
    ).length;
    const challengeSuccessRate = (detectedChallenges / challenges.length) * 100;

    const finalLivenessScore = Math.min(
      100,
      Math.max(0, analysisData.livenessScore * 0.7 + challengeSuccessRate * 0.3)
    );

    // Determine if liveness check passed
    const isLive =
      finalLivenessScore >= 75 &&
      analysisData.riskScore <= 25 &&
      !analysisData.presentationAttackDetected;

    // Build challenge results
    const challengeResults = analysisData.challengeResults.map(
      (r: { challenge: string; detected: boolean; confidence: number }) => ({
        challenge: r.challenge,
        detected: r.detected,
        confidence: r.confidence,
        details: {},
      })
    );

    // Add warnings
    const warnings: string[] = analysisData.warnings || [];
    if (finalLivenessScore < 75) {
      warnings.push("درجة الحيوية أقل من الحد الأدنى");
    }
    if (analysisData.riskScore > 25) {
      warnings.push("درجة المخاطرة أعلى من الحد الأقصى");
    }
    if (analysisData.presentationAttackDetected) {
      warnings.push(
        `تم كشف هجوم عرض: ${analysisData.presentationAttackType}`
      );
    }

    const result = {
      sessionId: "", // Will be set by caller
      livenessScore: Math.round(finalLivenessScore),
      riskScore: Math.round(analysisData.riskScore),
      isLive,
      challenges: challengeResults,
      presentationAttackDetected: analysisData.presentationAttackDetected,
      presentationAttackType: analysisData.presentationAttackType,
      presentationAttackProbability: analysisData.presentationAttackProbability,
      warnings,
      timestamp: Date.now(),
      cached: false,
    };

    // Cache the result
    if (useCache) {
      cacheAnalysis(videoUrl, result);
    }

    return result;
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error;
    }

    console.error("[Liveness Detection] Error analyzing video:", error);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "فشل في تحليل الفيديو للتحقق من الحيوية",
    });
  }
}

/**
 * Clear analysis cache (useful for testing or maintenance)
 */
export const clearAnalysisCache = (): void => {
  analysisCache.clear();
  console.log("[Liveness Detection] Analysis cache cleared");
}

/**
 * Get cache statistics
 */
export const getCacheStats = (): {
  size: number;
  maxSize: number;
  ttl: number;
} => {
  return {
    size: analysisCache.size,
    maxSize: 100,
    ttl: CACHE_TTL,
  };
}
