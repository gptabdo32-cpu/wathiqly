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
  users
} from "../drizzle/schema";

/**
 * Weights for the trust score calculation
 */
const WEIGHTS = {
  TRANSACTIONS: 0.40,
  KYC: 0.20,
  RATINGS: 0.30,
  RESPONSE: 0.10,
};

/**
 * Penalties
 */
const PENALTIES = {
  DISPUTE_LOST: 15.00, // Points deducted for losing a dispute
  NEGATIVE_REVIEW: 5.00, // Points deducted for 1-star review
};

/**
 * Calculates and updates the trust score for a user
 */
export async function updateTrustScore(userId: number, reason: string, relatedEntity?: { id: number, type: string }) {
  const db = await getDb();
  if (!db) return;

  const user = await getUserById(userId);
  if (!user) return;

  // 1. Calculate Transaction Factor (0-100)
  // Based on successful vs total transactions
  const userEscrows = await db.select().from(escrows).where(
    sql`${escrows.buyerId} = ${userId} OR ${escrows.sellerId} = ${userId}`
  );
  
  const totalCount = userEscrows.length;
  const successCount = userEscrows.filter(e => e.status === 'completed').length;
  const transactionFactor = totalCount > 0 ? (successCount / totalCount) * 100 : 50;

  // 2. Calculate KYC Factor (0-100)
  let kycFactor = 0;
  if (user.isPhoneVerified) kycFactor += 30;
  if (user.isIdentityVerified) kycFactor += 70;

  // 3. Calculate Rating Factor (0-100)
  const userReviews = await db.select().from(reviews).where(eq(reviews.revieweeId, userId));
  const avgRating = userReviews.length > 0 
    ? userReviews.reduce((sum, r) => sum + r.rating, 0) / userReviews.length 
    : 3.5; // Default middle rating
  const ratingFactor = (avgRating / 5) * 100;

  // 4. Calculate Dispute Penalty
  const lostDisputes = userEscrows.filter(e => e.status === 'completed' && e.disputeResolvedBy && e.disputeResolvedBy !== userId).length;
  const disputePenalty = lostDisputes * PENALTIES.DISPUTE_LOST;

  // 5. Final Score Calculation
  let finalScore = new Decimal(0)
    .plus(new Decimal(transactionFactor).mul(WEIGHTS.TRANSACTIONS))
    .plus(new Decimal(kycFactor).mul(WEIGHTS.KYC))
    .plus(new Decimal(ratingFactor).mul(WEIGHTS.RATINGS))
    .minus(new Decimal(disputePenalty))
    .toDecimalPlaces(2);

  // Clamp score between 0 and 100
  if (finalScore.lt(0)) finalScore = new Decimal(0);
  if (finalScore.gt(100)) finalScore = new Decimal(100);

  // 6. Update Database
  await db.transaction(async (tx) => {
    const [existingScore] = await tx.select().from(userTrustScores).where(eq(userTrustScores.userId, userId)).limit(1);
    
    const oldScore = existingScore ? existingScore.currentScore : "50.00";
    
    if (existingScore) {
      await tx.update(userTrustScores).set({
        currentScore: finalScore.toString(),
        transactionFactor: transactionFactor.toString(),
        kycFactor: kycFactor.toString(),
        ratingFactor: ratingFactor.toString(),
        disputePenalty: disputePenalty.toString(),
        successfulTransactionsCount: successCount,
        totalTransactionsCount: totalCount,
        lastCalculatedAt: new Date(),
      }).where(eq(userTrustScores.userId, userId));
    } else {
      await tx.insert(userTrustScores).values({
        userId,
        currentScore: finalScore.toString(),
        transactionFactor: transactionFactor.toString(),
        kycFactor: kycFactor.toString(),
        ratingFactor: ratingFactor.toString(),
        disputePenalty: disputePenalty.toString(),
        successfulTransactionsCount: successCount,
        totalTransactionsCount: totalCount,
      });
    }

    // Log history if score changed significantly (> 0.1)
    if (new Decimal(oldScore).minus(finalScore).abs().gt(0.1)) {
      await tx.insert(trustScoreHistory).values({
        userId,
        oldScore: oldScore.toString(),
        newScore: finalScore.toString(),
        changeReason: reason,
        relatedEntityId: relatedEntity?.id,
        relatedEntityType: relatedEntity?.type,
      });
    }

    // 7. Check for Badges
    await updateBadges(userId, finalScore.toNumber(), successCount, user.isIdentityVerified, tx);
  });

  return finalScore.toNumber();
}

/**
 * Updates user badges based on current stats
 */
async function updateBadges(userId: number, score: number, successCount: number, isVerified: boolean, tx: any) {
  const badgesToGrant: any[] = [];

  // Trusted Seller Badge
  if (score >= 85 && successCount >= 10) {
    badgesToGrant.push("trusted_seller");
  }

  // KYC Verified Badge
  if (isVerified) {
    badgesToGrant.push("kyc_verified");
  }

  // Golden Member
  if (score >= 95 && successCount >= 50) {
    badgesToGrant.push("golden_member");
  }

  for (const badgeType of badgesToGrant) {
    const [existing] = await tx.select().from(userBadges).where(
      and(eq(userBadges.userId, userId), eq(userBadges.badgeType, badgeType), eq(userBadges.isActive, true))
    ).limit(1);

    if (!existing) {
      await tx.insert(userBadges).values({
        userId,
        badgeType,
        issuedAt: new Date(),
      });
    }
  }
}

/**
 * Gets the trust score and badges for a user
 */
export async function getUserTrustData(userId: number) {
  const db = await getDb();
  if (!db) return null;

  const [score] = await db.select().from(userTrustScores).where(eq(userTrustScores.userId, userId)).limit(1);
  const badges = await db.select().from(userBadges).where(and(eq(userBadges.userId, userId), eq(userBadges.isActive, true)));

  return {
    score: score || { currentScore: "50.00", userId },
    badges
  };
}
