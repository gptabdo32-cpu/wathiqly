import { eq, and, desc, sql } from "drizzle-orm";
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

/**
 * Weights for the predictive trust score calculation
 */
const PREDICTIVE_WEIGHTS = {
  HISTORICAL: 0.60,
  AI_INSIGHT: 0.40,
};

/**
 * Records a new activity metric for a user
 */
export async function recordUserMetric(userId: number, type: "response_time" | "login_frequency" | "transaction_speed" | "dispute_rate" | "profile_completeness", value: number, metadata?: any) {
  const db = await getDb();
  if (!db) return;

  await db.insert(userActivityMetrics).values({
    userId,
    metricType: type,
    value: value.toString(),
    metadata,
  });
}

/**
 * Generates AI-based predictive insights for a user
 */
export async function generateAiPredictiveInsight(userId: number) {
  const db = await getDb();
  if (!db) return null;

  const user = await getUserById(userId);
  if (!user) return null;

  // Gather data for AI analysis
  const metrics = await db.select().from(userActivityMetrics).where(eq(userActivityMetrics.userId, userId)).limit(50);
  const userEscrows = await db.select().from(escrows).where(
    sql`${escrows.buyerId} = ${userId} OR ${escrows.sellerId} = ${userId}`
  ).limit(20);
  const userReviews = await db.select().from(reviews).where(eq(reviews.revieweeId, userId)).limit(20);

  const prompt = `
    Analyze the following user data from "Wathiqly" platform to predict their future reliability and risk level.
    User ID: ${userId}
    User Name: ${user.name}
    
    Recent Metrics: ${JSON.stringify(metrics)}
    Recent Transactions: ${JSON.stringify(userEscrows)}
    Recent Reviews: ${JSON.stringify(userReviews)}
    
    Provide a JSON response with:
    1. riskLevel: "low", "medium", "high", or "critical"
    2. fraudProbability: 0-100
    3. behavioralAnalysis: A brief professional summary in Arabic.
    4. riskFactors: Array of strings identifying potential risks.
    5. growthPotential: 0-100 (likelihood of being a top user).
    6. predictiveScore: 0-100 (overall AI trust score).
  `;

  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: "You are an expert risk analyst for a digital trust platform." },
        { role: "user", content: prompt }
      ],
      responseFormat: { type: "json_object" }
    });

    const aiData = JSON.parse(result.choices[0].message.content as string);
    
    // Update or insert predictive profile
    const [existingProfile] = await db.select().from(predictiveTrustProfiles).where(eq(predictiveTrustProfiles.userId, userId)).limit(1);
    
    if (existingProfile) {
      await db.update(predictiveTrustProfiles).set({
        riskLevel: aiData.riskLevel,
        fraudProbability: aiData.fraudProbability.toString(),
        behavioralAnalysis: aiData.behavioralAnalysis,
        riskFactors: aiData.riskFactors,
        growthPotential: aiData.growthPotential.toString(),
        lastAiAnalysisAt: new Date(),
      }).where(eq(predictiveTrustProfiles.userId, userId));
    } else {
      await db.insert(predictiveTrustProfiles).values({
        userId,
        riskLevel: aiData.riskLevel,
        fraudProbability: aiData.fraudProbability.toString(),
        behavioralAnalysis: aiData.behavioralAnalysis,
        riskFactors: aiData.riskFactors,
        growthPotential: aiData.growthPotential.toString(),
      });
    }

    return aiData.predictiveScore;
  } catch (error) {
    console.error("Error generating AI insight:", error);
    return 50; // Default middle score on error
  }
}

/**
 * Calculates the final Predictive Trust Score
 */
export async function updatePredictiveTrustScore(userId: number, historicalScore: number) {
  const db = await getDb();
  if (!db) return historicalScore;

  // 1. Get or Generate AI Score
  let aiScore = 50;
  const [profile] = await db.select().from(predictiveTrustProfiles).where(eq(predictiveTrustProfiles.userId, userId)).limit(1);
  
  // If profile is old (e.g., > 7 days) or doesn't exist, regenerate
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  if (!profile || (profile.lastAiAnalysisAt && profile.lastAiAnalysisAt < sevenDaysAgo)) {
    aiScore = await generateAiPredictiveInsight(userId) || 50;
  } else {
    // Calculate a simple score from existing profile data if not regenerating
    const riskPenalty = profile.riskLevel === "critical" ? 50 : profile.riskLevel === "high" ? 30 : profile.riskLevel === "medium" ? 10 : 0;
    aiScore = Math.max(0, 100 - parseFloat(profile.fraudProbability as string) - riskPenalty);
  }

  // 2. Final Weighted Calculation
  const finalScore = new Decimal(historicalScore).mul(PREDICTIVE_WEIGHTS.HISTORICAL)
    .plus(new Decimal(aiScore).mul(PREDICTIVE_WEIGHTS.AI_INSIGHT))
    .toDecimalPlaces(2);

  // 3. Update the main trust score table
  await db.update(userTrustScores).set({
    currentScore: finalScore.toString(),
    predictiveFactor: aiScore.toString(),
    updatedAt: new Date(),
  }).where(eq(userTrustScores.userId, userId));

  // 4. Log significant changes
  const [current] = await db.select().from(userTrustScores).where(eq(userTrustScores.userId, userId)).limit(1);
  if (current && new Decimal(current.currentScore).minus(finalScore).abs().gt(1.0)) {
    await db.insert(trustScoreHistory).values({
      userId,
      oldScore: current.currentScore,
      newScore: finalScore.toString(),
      changeReason: "predictive_ai_update",
    });
  }

  // 5. Check for Predictive Star Badge
  if (finalScore.gte(90) && aiScore >= 85) {
    const [existingBadge] = await db.select().from(userBadges).where(
      and(eq(userBadges.userId, userId), eq(userBadges.badgeType, "predictive_star"), eq(userBadges.isActive, true))
    ).limit(1);
    
    if (!existingBadge) {
      await db.insert(userBadges).values({
        userId,
        badgeType: "predictive_star",
        issuedAt: new Date(),
        metadata: { reason: "High AI-predicted reliability" }
      });
    }
  }

  return finalScore.toNumber();
}
