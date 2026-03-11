/**
 * Fraud Detection Service
 * Detects suspicious verification attempts and flags them for manual review
 */

import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { users, identityVerifications } from "../../drizzle/schema";
import { eq, and, gte } from "drizzle-orm";

export interface FraudRiskAssessment {
  riskScore: number; // 0-100
  riskLevel: "low" | "medium" | "high" | "critical";
  flags: FraudFlag[];
  recommendations: string[];
  shouldReview: boolean;
}

export interface FraudFlag {
  type: string;
  severity: "info" | "warning" | "critical";
  description: string;
  value?: any;
}

/**
 * Assess fraud risk for a verification attempt
 * @param userId - User ID
 * @param ipAddress - IP address of the request
 * @param userAgent - User agent string
 * @returns Fraud risk assessment
 */
export async function assessFraudRisk(
  userId: number,
  ipAddress?: string,
  userAgent?: string
): Promise<FraudRiskAssessment> {
  const db = await getDb();
  if (!db) {
    return {
      riskScore: 0,
      riskLevel: "low",
      flags: [],
      recommendations: [],
      shouldReview: false,
    };
  }

  const flags: FraudFlag[] = [];
  let riskScore = 0;

  try {
    // 1. Check for multiple verification attempts from same user
    const recentAttempts = await db
      .select()
      .from(identityVerifications)
      .where(
        and(
          eq(identityVerifications.userId, userId),
          gte(
            identityVerifications.createdAt,
            new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
          )
        )
      );

    if (recentAttempts.length > 3) {
      flags.push({
        type: "multiple_attempts",
        severity: "warning",
        description: `User has made ${recentAttempts.length} verification attempts in the last 24 hours`,
        value: recentAttempts.length,
      });
      riskScore += 15;
    }

    // 2. Check for failed attempts
    const failedAttempts = recentAttempts.filter((a) => a.status === "rejected");
    if (failedAttempts.length > 1) {
      flags.push({
        type: "repeated_failures",
        severity: "warning",
        description: `User has ${failedAttempts.length} failed verification attempts`,
        value: failedAttempts.length,
      });
      riskScore += 20;
    }

    // 3. Check for same national ID used multiple times
    const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (user.length > 0 && user[0].nationalIdNumberEncrypted) {
      const duplicateIds = await db
        .select()
        .from(users)
        .where(eq(users.nationalIdNumberEncrypted, user[0].nationalIdNumberEncrypted));

      if (duplicateIds.length > 1) {
        flags.push({
          type: "duplicate_national_id",
          severity: "critical",
          description: `National ID is associated with ${duplicateIds.length} accounts`,
          value: duplicateIds.length,
        });
        riskScore += 50;
      }
    }

    // 4. Check IP address reputation (basic check)
    if (ipAddress) {
      const ipAttempts = await db
        .select()
        .from(identityVerifications)
        .where(
          and(
            eq(identityVerifications.ipAddress, ipAddress),
            gte(
              identityVerifications.createdAt,
              new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
            )
          )
        );

      if (ipAttempts.length > 10) {
        flags.push({
          type: "suspicious_ip",
          severity: "warning",
          description: `IP address has ${ipAttempts.length} verification attempts in the last 7 days`,
          value: ipAttempts.length,
        });
        riskScore += 25;
      }
    }

    // 5. Check for rapid verification attempts (within minutes)
    if (recentAttempts.length > 0) {
      const lastAttempt = recentAttempts[recentAttempts.length - 1];
      const timeSinceLastAttempt = Date.now() - lastAttempt.createdAt.getTime();
      const minutesSinceLastAttempt = timeSinceLastAttempt / (1000 * 60);

      if (minutesSinceLastAttempt < 5) {
        flags.push({
          type: "rapid_attempts",
          severity: "warning",
          description: `Last verification attempt was ${Math.round(minutesSinceLastAttempt)} minutes ago`,
          value: minutesSinceLastAttempt,
        });
        riskScore += 10;
      }
    }

    // 6. Check for new user with immediate verification
    if (user.length > 0) {
      const accountAge = Date.now() - user[0].createdAt.getTime();
      const hoursOld = accountAge / (1000 * 60 * 60);

      if (hoursOld < 1) {
        flags.push({
          type: "new_account_verification",
          severity: "info",
          description: "Account is less than 1 hour old",
          value: hoursOld,
        });
        riskScore += 5;
      }
    }
  } catch (error) {
    console.error("[Fraud Detection] Error assessing fraud risk:", error);
  }

  // Determine risk level
  let riskLevel: "low" | "medium" | "high" | "critical" = "low";
  if (riskScore >= 80) {
    riskLevel = "critical";
  } else if (riskScore >= 60) {
    riskLevel = "high";
  } else if (riskScore >= 30) {
    riskLevel = "medium";
  }

  // Generate recommendations
  const recommendations: string[] = [];
  if (riskLevel === "critical") {
    recommendations.push("Require manual review before approval");
    recommendations.push("Consider temporary account suspension");
  } else if (riskLevel === "high") {
    recommendations.push("Request additional verification documents");
    recommendations.push("Verify through phone call");
  } else if (riskLevel === "medium") {
    recommendations.push("Monitor account for suspicious activity");
    recommendations.push("Consider additional security questions");
  }

  return {
    riskScore: Math.min(100, riskScore),
    riskLevel,
    flags,
    recommendations,
    shouldReview: riskLevel === "high" || riskLevel === "critical",
  };
}

/**
 * Check if national ID is already verified
 * @param nationalIdHash - SHA-256 hash of national ID
 * @returns User ID if found, null otherwise
 */
export async function checkDuplicateNationalId(nationalIdHash: string): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const result = await db
      .select()
      .from(identityVerifications)
      .where(eq(identityVerifications.nationalIdNumberHash, nationalIdHash))
      .limit(1);

    return result.length > 0 ? result[0].userId : null;
  } catch (error) {
    console.error("[Fraud Detection] Error checking duplicate national ID:", error);
    return null;
  }
}

/**
 * Check if face image appears to be a deepfake or manipulated
 * @param faceMatchScore - Face match score
 * @param livenessScore - Liveness detection score
 * @param warnings - List of warnings from face recognition
 * @returns True if image appears suspicious
 */
export function isSuspiciousFaceImage(
  faceMatchScore: number,
  livenessScore?: number,
  warnings?: string[]
): boolean {
  // Check for obvious signs of manipulation
  if (faceMatchScore < 50) {
    return true;
  }

  // Check liveness score
  if (livenessScore !== undefined && livenessScore < 50) {
    return true;
  }

  // Check for specific warnings
  if (warnings && warnings.length > 0) {
    const suspiciousWarnings = [
      "edited",
      "manipulated",
      "deepfake",
      "synthetic",
      "printed",
      "screen",
    ];
    for (const warning of warnings) {
      if (suspiciousWarnings.some((w) => warning.toLowerCase().includes(w))) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Get fraud detection report for admin dashboard
 * @param limit - Maximum number of flagged users to return
 * @returns List of flagged verification attempts
 */
export async function getFraudFlaggedVerifications(limit: number = 50) {
  const db = await getDb();
  if (!db) return [];

  try {
    return await db
      .select()
      .from(identityVerifications)
      .where(eq(identityVerifications.status, "flagged"))
      .limit(limit);
  } catch (error) {
    console.error("[Fraud Detection] Error fetching flagged verifications:", error);
    return [];
  }
}

/**
 * Flag a verification for manual review
 * @param verificationId - Verification ID
 * @param reason - Reason for flagging
 */
export async function flagVerificationForReview(verificationId: number, reason: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    // Note: This would require updating the schema to add a flagReason field
    console.log(`[Fraud Detection] Flagged verification ${verificationId} for review: ${reason}`);
  } catch (error) {
    console.error("[Fraud Detection] Error flagging verification:", error);
  }
}

/**
 * Generate fraud risk report
 * @returns Fraud statistics and trends
 */
export async function generateFraudReport() {
  const db = await getDb();
  if (!db) {
    return {
      totalAttempts: 0,
      flaggedAttempts: 0,
      rejectedAttempts: 0,
      approvedAttempts: 0,
      flagRate: 0,
      rejectionRate: 0,
    };
  }

  try {
    const allAttempts = await db.select().from(identityVerifications);
    const flaggedAttempts = allAttempts.filter((a) => a.status === "flagged");
    const rejectedAttempts = allAttempts.filter((a) => a.status === "rejected");
    const approvedAttempts = allAttempts.filter((a) => a.status === "approved");

    return {
      totalAttempts: allAttempts.length,
      flaggedAttempts: flaggedAttempts.length,
      rejectedAttempts: rejectedAttempts.length,
      approvedAttempts: approvedAttempts.length,
      flagRate: allAttempts.length > 0 ? (flaggedAttempts.length / allAttempts.length) * 100 : 0,
      rejectionRate: allAttempts.length > 0 ? (rejectedAttempts.length / allAttempts.length) * 100 : 0,
    };
  } catch (error) {
    console.error("[Fraud Detection] Error generating fraud report:", error);
    return {
      totalAttempts: 0,
      flaggedAttempts: 0,
      rejectedAttempts: 0,
      approvedAttempts: 0,
      flagRate: 0,
      rejectionRate: 0,
    };
  }
}
