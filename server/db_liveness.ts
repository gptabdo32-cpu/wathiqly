/**
 * Liveness Detection Database Helpers
 * Query and mutation helpers for liveness detection tables
 */

import { eq, desc } from "drizzle-orm";
import { getDb } from "./db";
import {
  livenessSessionsTable,
  livenessAnalysisResultsTable,
  presentationAttackLogsTable,
  usersWithLiveness,
  InsertLivenessSession,
  InsertLivenessAnalysisResult,
  InsertPresentationAttackLog,
  InsertUserLiveness,
} from "../drizzle/schema";

/**
 * Create a new liveness session
 */
export async function createLivenessSession(
  session: InsertLivenessSession
): Promise<typeof livenessSessionsTable.$inferSelect> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .insert(livenessSessionsTable)
    .values(session)
    .$returningId();

  const created = await db
    .select()
    .from(livenessSessionsTable)
    .where(eq(livenessSessionsTable.sessionId, session.sessionId))
    .limit(1);

  return created[0];
}

/**
 * Get liveness session by ID
 */
export async function getLivenessSession(sessionId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .select()
    .from(livenessSessionsTable)
    .where(eq(livenessSessionsTable.sessionId, sessionId))
    .limit(1);

  return result[0];
}

/**
 * Update liveness session
 */
export async function updateLivenessSession(
  sessionId: string,
  updates: Partial<InsertLivenessSession>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(livenessSessionsTable)
    .set(updates)
    .where(eq(livenessSessionsTable.sessionId, sessionId));

  return getLivenessSession(sessionId);
}

/**
 * Get user's liveness sessions
 */
export async function getUserLivenessSessions(
  userId: number,
  limit: number = 10
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db
    .select()
    .from(livenessSessionsTable)
    .where(eq(livenessSessionsTable.userId, userId))
    .orderBy(desc(livenessSessionsTable.createdAt))
    .limit(limit);
}

/**
 * Insert liveness analysis result
 */
export async function insertLivenessAnalysisResult(
  result: InsertLivenessAnalysisResult
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(livenessAnalysisResultsTable).values(result);
}

/**
 * Get analysis results for a session
 */
export async function getSessionAnalysisResults(sessionId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db
    .select()
    .from(livenessAnalysisResultsTable)
    .where(eq(livenessAnalysisResultsTable.sessionId, sessionId))
    .orderBy(livenessAnalysisResultsTable.frameNumber);
}

/**
 * Insert presentation attack log
 */
export async function insertPresentationAttackLog(
  log: InsertPresentationAttackLog
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(presentationAttackLogsTable).values(log);
}

/**
 * Get presentation attack log for a session
 */
export async function getPresentationAttackLog(sessionId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .select()
    .from(presentationAttackLogsTable)
    .where(eq(presentationAttackLogsTable.sessionId, sessionId))
    .limit(1);

  return result[0];
}

/**
 * Update or create user liveness record
 */
export async function upsertUserLiveness(
  userId: number,
  updates: Partial<InsertUserLiveness>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db
    .select()
    .from(usersWithLiveness)
    .where(eq(usersWithLiveness.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(usersWithLiveness)
      .set(updates)
      .where(eq(usersWithLiveness.userId, userId));
  } else {
    await db
      .insert(usersWithLiveness)
      .values({
        userId,
        ...updates,
      });
  }

  return db
    .select()
    .from(usersWithLiveness)
    .where(eq(usersWithLiveness.userId, userId))
    .limit(1)
    .then((r) => r[0]);
}

/**
 * Get user liveness record
 */
export async function getUserLiveness(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .select()
    .from(usersWithLiveness)
    .where(eq(usersWithLiveness.userId, userId))
    .limit(1);

  return result[0];
}

/**
 * Increment failed liveness attempts
 */
export async function incrementFailedLivenessAttempts(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const current = await getUserLiveness(userId);
  const failedAttempts = (current?.failedLivenessAttempts || 0) + 1;

  return upsertUserLiveness(userId, {
    failedLivenessAttempts: failedAttempts,
    lastLivenessAttemptAt: new Date(),
  });
}

/**
 * Mark user as liveness verified
 */
export async function markUserLivenessVerified(
  userId: number,
  sessionId: string,
  livenessScore: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return upsertUserLiveness(userId, {
    livenessVerifiedAt: new Date(),
    livenessScore,
    lastLivenessSessionId: sessionId,
    livenessVerificationCount: (await getUserLiveness(userId))
      ?.livenessVerificationCount
      ? (await getUserLiveness(userId))!.livenessVerificationCount! + 1
      : 1,
    failedLivenessAttempts: 0,
    lastLivenessAttemptAt: new Date(),
  });
}

/**
 * Get liveness verification statistics for a user
 */
export async function getUserLivenessStats(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const sessions = await getUserLivenessSessions(userId, 100);
  const completedSessions = sessions.filter((s) => s.status === "completed");
  const successfulSessions = completedSessions.filter((s) => s.isLive);

  const successRate =
    completedSessions.length > 0
      ? (successfulSessions.length / completedSessions.length) * 100
      : 0;

  const avgLivenessScore =
    successfulSessions.length > 0
      ? successfulSessions.reduce((sum, s) => sum + (s.livenessScore || 0), 0) /
        successfulSessions.length
      : 0;

  const avgRiskScore =
    completedSessions.length > 0
      ? completedSessions.reduce((sum, s) => sum + (s.riskScore || 0), 0) /
        completedSessions.length
      : 0;

  return {
    totalSessions: sessions.length,
    completedSessions: completedSessions.length,
    successfulSessions: successfulSessions.length,
    successRate: Math.round(successRate),
    avgLivenessScore: Math.round(avgLivenessScore),
    avgRiskScore: Math.round(avgRiskScore),
    lastVerifiedAt: successfulSessions[0]?.completedAt,
  };
}
