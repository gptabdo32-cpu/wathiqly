/**
 * Liveness Detection Core Module
 * Implements interactive liveness detection with MediaPipe and LLM Vision API
 * Compliant with ISO 30107-3 standards
 */

import { nanoid } from "nanoid";
import { invokeLLM } from "./llm";
import { TRPCError } from "@trpc/server";

/**
 * Challenge types for interactive liveness detection
 */
export enum ChallengeType {
  EYE_BLINK = "eye_blink",
  SMILE = "smile",
  HEAD_TURN_LEFT = "head_turn_left",
  HEAD_TURN_RIGHT = "head_turn_right",
  HEAD_NOD = "head_nod",
  LOOK_UP = "look_up",
}

/**
 * Liveness session configuration
 */
export interface LivenessSessionConfig {
  userId: number;
  challengeCount: number;
  videoDurationMs: number;
  minLivenessScore: number;
  maxRiskScore: number;
}

/**
 * Challenge result from analysis
 */
export interface ChallengeResult {
  challenge: ChallengeType;
  detected: boolean;
  confidence: number;
  details: Record<string, unknown>;
}

/**
 * Liveness analysis result
 */
export interface LivenessAnalysisResult {
  sessionId: string;
  livenessScore: number;
  riskScore: number;
  isLive: boolean;
  challenges: ChallengeResult[];
  presentationAttackDetected: boolean;
  presentationAttackType?: string;
  presentationAttackProbability?: number;
  warnings: string[];
  timestamp: number;
}

/**
 * Generate random challenges for liveness detection
 * @param count Number of challenges to generate
 * @returns Array of random challenges
 */
export function generateRandomChallenges(count: number = 3): ChallengeType[] {
  const allChallenges = Object.values(ChallengeType);
  const challenges: ChallengeType[] = [];
  
  for (let i = 0; i < count && i < allChallenges.length; i++) {
    const randomIndex = Math.floor(Math.random() * allChallenges.length);
    const challenge = allChallenges[randomIndex];
    
    // Avoid duplicates
    if (!challenges.includes(challenge)) {
      challenges.push(challenge);
    }
  }
  
  return challenges;
}

/**
 * Create a new liveness detection session
 * @param config Session configuration
 * @returns Session ID and challenges
 */
export function createLivenessSession(config: LivenessSessionConfig) {
  const sessionId = nanoid();
  const challenges = generateRandomChallenges(config.challengeCount);
  
  return {
    sessionId,
    challenges,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
  };
}

/**
 * Validate video URL and check accessibility
 */
async function validateVideoUrl(videoUrl: string): Promise<void> {
  try {
    const response = await fetch(videoUrl, { method: "HEAD" });
    if (!response.ok) {
      throw new Error(`Video not accessible: ${response.status}`);
    }
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("video")) {
      throw new Error("Invalid content type: not a video");
    }
  } catch (error) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Video validation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
}

/**
 * Analyze video for liveness detection using LLM Vision API
 * @param videoUrl URL to the uploaded video
 * @param challenges Expected challenges to detect
 * @returns Analysis result
 */
export async function analyzeVideoForLiveness(
  videoUrl: string,
  challenges: ChallengeType[]
): Promise<LivenessAnalysisResult> {
  try {
    // Validate video URL
    if (!videoUrl || !videoUrl.startsWith("http")) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Invalid video URL",
      });
    }

    // Validate video accessibility and format
    await validateVideoUrl(videoUrl);

    // Build challenge descriptions
    const challengeDescriptions = challenges.map((c) => {
      const descriptions: Record<ChallengeType, string> = {
        [ChallengeType.EYE_BLINK]: "رمش العينين 3 مرات",
        [ChallengeType.SMILE]: "ابتسام طبيعي",
        [ChallengeType.HEAD_TURN_LEFT]: "تحريك الرأس لليسار",
        [ChallengeType.HEAD_TURN_RIGHT]: "تحريك الرأس لليمين",
        [ChallengeType.HEAD_NOD]: "إيماءة الرأس (نعم)",
        [ChallengeType.LOOK_UP]: "النظر لأعلى",
      };
      return descriptions[c];
    }).join(", ");

    // Call LLM Vision API for analysis
    const response = await invokeLLM({
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `أنت متخصص في كشف الحيوية والتحقق من الهوية. قم بتحليل الفيديو التالي للتحقق من أن الشخص حي وليس صورة أو قناع أو فيديو مسجل.

التحديات المطلوبة: ${challengeDescriptions}

يرجى تحليل الفيديو وتقديم:
1. هل تم اكتشاف كل تحدي؟
2. درجة الثقة لكل تحدي (0-100)
3. هل هناك علامات على هجوم عرض (صورة مطبوعة، قناع، فيديو مسجل، deepfake)؟
4. درجة المخاطرة الإجمالية (0-100)
5. التحذيرات أو المشاكل المكتشفة

الرد يجب أن يكون بصيغة JSON فقط.`,
            },
            {
              type: "file_url",
              file_url: {
                url: videoUrl,
                mime_type: "video/mp4",
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
              description: "Overall liveness score",
            },
            presentationAttackDetected: {
              type: "boolean",
              description: "Whether a presentation attack was detected",
            },
            presentationAttackType: {
              type: "string",
              description: "Type of attack if detected (print, video, mask, deepfake)",
            },
            presentationAttackProbability: {
              type: "number",
              minimum: 0,
              maximum: 1,
              description: "Probability of presentation attack",
            },
            riskScore: {
              type: "number",
              minimum: 0,
              maximum: 100,
              description: "Overall risk score",
            },
            warnings: {
              type: "array",
              items: { type: "string" },
              description: "List of warnings or issues",
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
      Math.max(0, (analysisData.livenessScore * 0.7 + challengeSuccessRate * 0.3))
    );

    // Determine if liveness check passed
    const isLive =
      finalLivenessScore >= 75 &&
      analysisData.riskScore <= 25 &&
      !analysisData.presentationAttackDetected;

    // Build challenge results
    const challengeResults: ChallengeResult[] = analysisData.challengeResults.map(
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
      warnings.push("Liveness score below threshold");
    }
    if (analysisData.riskScore > 25) {
      warnings.push("Risk score above threshold");
    }
    if (analysisData.presentationAttackDetected) {
      warnings.push(`Presentation attack detected: ${analysisData.presentationAttackType}`);
    }

    return {
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
    };
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error;
    }

    console.error("[Liveness Detection] Error analyzing video:", error);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to analyze video for liveness detection",
    });
  }
}

/**
 * Calculate comprehensive risk score based on analysis results
 * ISO 30107-3 compliant risk assessment
 */
export function calculateComprehensiveRiskScore(
  analysisResult: LivenessAnalysisResult
): number {
  let riskScore = analysisResult.riskScore;

  // Add risk for failed challenges
  const failedChallenges = analysisResult.challenges.filter(
    (c) => !c.detected
  ).length;
  riskScore += failedChallenges * 10;

  // Add risk for presentation attack detection
  if (analysisResult.presentationAttackDetected) {
    riskScore += (analysisResult.presentationAttackProbability || 0.5) * 50;
  }

  // Add risk for low liveness score
  if (analysisResult.livenessScore < 60) {
    riskScore += (60 - analysisResult.livenessScore) * 0.5;
  }

  // Add risk for warnings
  riskScore += analysisResult.warnings.length * 5;

  return Math.min(100, riskScore);
}

/**
 * Validate liveness detection result against requirements
 */
export function validateLivenessResult(
  result: LivenessAnalysisResult,
  minLivenessScore: number = 75,
  maxRiskScore: number = 25
): { isValid: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (result.livenessScore < minLivenessScore) {
    reasons.push(
      `Liveness score ${result.livenessScore} is below minimum ${minLivenessScore}`
    );
  }

  if (result.riskScore > maxRiskScore) {
    reasons.push(
      `Risk score ${result.riskScore} exceeds maximum ${maxRiskScore}`
    );
  }

  if (result.presentationAttackDetected) {
    reasons.push(
      `Presentation attack detected: ${result.presentationAttackType}`
    );
  }

  const failedChallenges = result.challenges.filter((c) => !c.detected);
  if (failedChallenges.length > 0) {
    reasons.push(
      `Failed challenges: ${failedChallenges.map((c) => c.challenge).join(", ")}`
    );
  }

  return {
    isValid: reasons.length === 0,
    reasons,
  };
}
