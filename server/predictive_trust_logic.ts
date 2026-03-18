import { eq, and, desc, sql, lt } from "drizzle-orm";
import { Decimal } from "decimal.js";
import { 
  getDb, 
  getUserById 
} from "./db";
import { 
  userTrustScores, 
  trustScoreHistory, 
  userBadges, 
  escrows, 
  reviews,
  users,
  predictiveTrustProfiles,
  userActivityMetrics
} from "../drizzle/schema";
import { invokeLLM } from "./_core/llm";
import { encryptData, decryptData } from "./_core/encryption";

/**
 * Advanced Predictive Trust Logic
 * Implements: 
 * 1. Data Encryption at Rest for AI insights
 * 2. Rate Limiting for AI Analysis (Cost & Security)
 * 3. Explainable AI (XAI) principles
 * 4. Automated Risk Mitigation
 */

const PREDICTIVE_WEIGHTS = {
  HISTORICAL: 0.60,
  AI_INSIGHT: 0.40,
};

const ANALYSIS_COOLDOWN_DAYS = 3; // Prevent frequent expensive AI calls

/**
 * Securely records a new activity metric
 */
export async function recordUserMetric(userId: number, type: "response_time" | "login_frequency" | "transaction_speed" | "dispute_rate" | "profile_completeness", value: number, metadata?: any) {
  const db = await getDb();
  if (!db) return;

  // Validate value range for security
  if (isNaN(value) || value < 0) return;

  await db.insert(userActivityMetrics).values({
    userId,
    metricType: type,
    value: value.toString(),
    metadata: metadata ? metadata : null,
  });
}

/**
 * AI-powered Predictive Analysis with Privacy-Preserving measures
 */
export async function generateAiPredictiveInsight(userId: number) {
  const db = await getDb();
  if (!db) return null;

  const user = await getUserById(userId);
  if (!user) return null;

  // 1. Rate Limiting Check (Security & Cost Control)
  const [lastProfile] = await db.select().from(predictiveTrustProfiles).where(eq(predictiveTrustProfiles.userId, userId)).limit(1);
  const cooldownDate = new Date();
  cooldownDate.setDate(cooldownDate.getDate() - ANALYSIS_COOLDOWN_DAYS);
  
  if (lastProfile?.lastAiAnalysisAt && lastProfile.lastAiAnalysisAt > cooldownDate) {
    return null; // Too soon for another analysis
  }

  // 2. Data Sanitization & Aggregation
  const metrics = await db.select().from(userActivityMetrics).where(eq(userActivityMetrics.userId, userId)).limit(30);
  const userEscrows = await db.select({
    status: escrows.status,
    amount: escrows.amount,
    createdAt: escrows.createdAt
  }).from(escrows).where(
    sql`${escrows.buyerId} = ${userId} OR ${escrows.sellerId} = ${userId}`
  ).limit(15);

  // 3. AI Analysis Request (Using Explainable AI Prompting)
  const prompt = `
    Task: Conduct a high-precision predictive risk assessment for user ${userId}.
    Context: Wathiqly Digital Trust Platform.
    
    Data Summary:
    - Activity Metrics: ${JSON.stringify(metrics.map(m => ({ type: m.metricType, val: m.value })))}
    - Transaction Volume: ${userEscrows.length}
    - Recent Success Rate: ${userEscrows.filter(e => e.status === 'completed').length / (userEscrows.length || 1)}
    
    Required Output (JSON):
    {
      "riskLevel": "low" | "medium" | "high" | "critical",
      "fraudProbability": number (0-100),
      "behavioralAnalysis": "Professional Arabic summary",
      "riskFactors": ["factor1", "factor2"],
      "predictiveScore": number (0-100),
      "explanation": "Technical reasoning for the score"
    }
  `;

  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: "You are a Senior Risk Architect. Provide objective, data-driven trust predictions." },
        { role: "user", content: prompt }
      ],
      responseFormat: { type: "json_object" }
    });

    const aiData = JSON.parse(result.choices[0].message.content as string);
    
    // 4. Encrypt sensitive AI insights before storage (Security Requirement)
    const encryptedAnalysis = encryptData(aiData.behavioralAnalysis);
    const encryptedExplanation = encryptData(aiData.explanation || "");

    if (lastProfile) {
      await db.update(predictiveTrustProfiles).set({
        riskLevel: aiData.riskLevel,
        fraudProbability: aiData.fraudProbability.toString(),
        behavioralAnalysis: encryptedAnalysis, // Store encrypted
        riskFactors: aiData.riskFactors,
        lastAiAnalysisAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(predictiveTrustProfiles.userId, userId));
    } else {
      await db.insert(predictiveTrustProfiles).values({
        userId,
        riskLevel: aiData.riskLevel,
        fraudProbability: aiData.fraudProbability.toString(),
        behavioralAnalysis: encryptedAnalysis,
        riskFactors: aiData.riskFactors,
      });
    }

    return aiData.predictiveScore;
  } catch (error) {
    console.error("[CRITICAL] AI Trust Analysis Failed:", error);
    return null;
  }
}

/**
 * Orchestrates the full Trust Score Update with Security Guards
 */
export async function updatePredictiveTrustScore(userId: number, historicalScore: number) {
  const db = await getDb();
  if (!db) return historicalScore;

  // 1. Trigger AI Insight (Respects Cooldown)
  const aiScore = await generateAiPredictiveInsight(userId);
  
  // 2. Fetch current profile for final calculation
  const [profile] = await db.select().from(predictiveTrustProfiles).where(eq(predictiveTrustProfiles.userId, userId)).limit(1);
  
  let finalAiComponent = 50;
  if (aiScore !== null) {
    finalAiComponent = aiScore;
  } else if (profile) {
    // Derived score from existing profile if AI wasn't re-run
    const riskPenalty = profile.riskLevel === "critical" ? 60 : profile.riskLevel === "high" ? 30 : 0;
    finalAiComponent = Math.max(0, 100 - parseFloat(profile.fraudProbability as string) - riskPenalty);
  }

  // 3. Weighted Hybrid Calculation (Historical + Predictive)
  const finalScore = new Decimal(historicalScore).mul(PREDICTIVE_WEIGHTS.HISTORICAL)
    .plus(new Decimal(finalAiComponent).mul(PREDICTIVE_WEIGHTS.AI_INSIGHT))
    .toDecimalPlaces(2);

  // 4. Atomic Database Update
  await db.transaction(async (tx) => {
    const [current] = await tx.select().from(userTrustScores).where(eq(userTrustScores.userId, userId)).limit(1);
    
    await tx.update(userTrustScores).set({
      currentScore: finalScore.toString(),
      predictiveFactor: finalAiComponent.toString(),
      updatedAt: new Date(),
    }).where(eq(userTrustScores.userId, userId));

    // 5. High-Impact Change Logging (Audit Trail)
    if (current && new Decimal(current.currentScore).minus(finalScore).abs().gt(5.0)) {
      await tx.insert(trustScoreHistory).values({
        userId,
        oldScore: current.currentScore,
        newScore: finalScore.toString(),
        changeReason: "predictive_audit_recalculation",
      });
    }
  });

  return finalScore.toNumber();
}

/**
 * Decrypts and retrieves the full predictive profile for authorized viewers
 */
export async function getDecryptedPredictiveProfile(userId: number) {
  const db = await getDb();
  if (!db) return null;

  const [profile] = await db.select().from(predictiveTrustProfiles).where(eq(predictiveTrustProfiles.userId, userId)).limit(1);
  if (!profile) return null;

  try {
    return {
      ...profile,
      behavioralAnalysis: profile.behavioralAnalysis ? decryptData(profile.behavioralAnalysis) : null,
    };
  } catch (e) {
    console.error("Decryption failed for user profile:", userId);
    return { ...profile, behavioralAnalysis: "[DECRYPTION_ERROR]" };
  }
}
