import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Liveness Detection Sessions Table
 * Stores metadata for each liveness detection session
 */
export const livenessSessionsTable = mysqlTable("liveness_sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  sessionId: varchar("sessionId", { length: 64 }).notNull().unique(),
  status: mysqlEnum("status", ["pending", "in_progress", "completed", "failed"]).default("pending").notNull(),
  
  // Challenge information
  challenges: text("challenges").notNull(), // JSON array of challenge types
  completedChallenges: text("completedChallenges").notNull(), // JSON array of completed challenges
  
  // Video information
  videoUrl: text("videoUrl"), // URL to uploaded video in S3
  videoKey: varchar("videoKey", { length: 255 }), // S3 key for video
  videoDuration: int("videoDuration"), // Duration in milliseconds
  
  // Scores and results
  livenessScore: int("livenessScore"), // 0-100
  riskScore: int("riskScore"), // 0-100 (lower is better)
  isLive: boolean("isLive"), // Final determination
  
  // Detailed analysis results (JSON)
  analysisResults: text("analysisResults"), // JSON with detailed analysis
  
  // Timestamps
  startedAt: timestamp("startedAt").notNull(),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LivenessSession = typeof livenessSessionsTable.$inferSelect;
export type InsertLivenessSession = typeof livenessSessionsTable.$inferInsert;

/**
 * Liveness Analysis Results Table
 * Stores detailed frame-by-frame analysis results
 */
export const livenessAnalysisResultsTable = mysqlTable("liveness_analysis_results", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: varchar("sessionId", { length: 64 }).notNull().references(() => livenessSessionsTable.sessionId),
  
  // Frame information
  frameNumber: int("frameNumber").notNull(),
  timestamp: int("timestamp").notNull(), // Milliseconds from start
  
  // Eye analysis
  eyeBlinkDetected: boolean("eyeBlinkDetected"),
  eyeAspectRatio: decimal("eyeAspectRatio", { precision: 5, scale: 3 }), // EAR value
  leftEyeOpen: boolean("leftEyeOpen"),
  rightEyeOpen: boolean("rightEyeOpen"),
  
  // Smile detection
  smileDetected: boolean("smileDetected"),
  smileIntensity: decimal("smileIntensity", { precision: 3, scale: 2 }), // 0-1
  
  // Head pose
  headYaw: decimal("headYaw", { precision: 5, scale: 2 }), // Degrees
  headPitch: decimal("headPitch", { precision: 5, scale: 2 }), // Degrees
  headRoll: decimal("headRoll", { precision: 5, scale: 2 }), // Degrees
  
  // Corneal reflection
  corneaReflectionDetected: boolean("corneaReflectionDetected"),
  reflectionCount: int("reflectionCount"),
  reflectionStability: decimal("reflectionStability", { precision: 3, scale: 2 }), // 0-1
  
  // Skin analysis
  skinDistortionScore: decimal("skinDistortionScore", { precision: 3, scale: 2 }), // 0-1
  textureAnalysisScore: decimal("textureAnalysisScore", { precision: 3, scale: 2 }), // 0-1
  frequencyDomainScore: decimal("frequencyDomainScore", { precision: 3, scale: 2 }), // 0-1
  
  // Overall frame score
  frameScore: decimal("frameScore", { precision: 5, scale: 2 }), // 0-100
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type LivenessAnalysisResult = typeof livenessAnalysisResultsTable.$inferSelect;
export type InsertLivenessAnalysisResult = typeof livenessAnalysisResultsTable.$inferInsert;

/**
 * Presentation Attack Detection Logs Table
 * Stores anti-spoofing detection results
 */
export const presentationAttackLogsTable = mysqlTable("presentation_attack_logs", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: varchar("sessionId", { length: 64 }).notNull().references(() => livenessSessionsTable.sessionId),
  
  // Attack type detection
  printAttackDetected: boolean("printAttackDetected"),
  videoReplayDetected: boolean("videoReplayDetected"),
  maskAttackDetected: boolean("maskAttackDetected"),
  deepfakeDetected: boolean("deepfakeDetected"),
  injectionAttackDetected: boolean("injectionAttackDetected"),
  
  // Attack probabilities
  printAttackProbability: decimal("printAttackProbability", { precision: 3, scale: 2 }), // 0-1
  videoReplayProbability: decimal("videoReplayProbability", { precision: 3, scale: 2 }), // 0-1
  maskAttackProbability: decimal("maskAttackProbability", { precision: 3, scale: 2 }), // 0-1
  deepfakeProbability: decimal("deepfakeProbability", { precision: 3, scale: 2 }), // 0-1
  injectionAttackProbability: decimal("injectionAttackProbability", { precision: 3, scale: 2 }), // 0-1
  
  // Analysis details (JSON)
  textureAnalysis: text("textureAnalysis"), // JSON
  frequencyAnalysis: text("frequencyAnalysis"), // JSON
  physiologicalAnalysis: text("physiologicalAnalysis"), // JSON
  
  // Overall assessment
  overallRiskScore: decimal("overallRiskScore", { precision: 5, scale: 2 }), // 0-100
  isPresentationAttack: boolean("isPresentationAttack"),
  confidence: decimal("confidence", { precision: 3, scale: 2 }), // 0-1
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PresentationAttackLog = typeof presentationAttackLogsTable.$inferSelect;
export type InsertPresentationAttackLog = typeof presentationAttackLogsTable.$inferInsert;

/**
 * Update users table with liveness-related fields
 */
export const usersWithLiveness = mysqlTable("users_liveness", {
  userId: int("userId").primaryKey().references(() => users.id),
  livenessVerifiedAt: timestamp("livenessVerifiedAt"),
  livenessScore: int("livenessScore"), // Last liveness score
  lastLivenessSessionId: varchar("lastLivenessSessionId", { length: 64 }),
  livenessVerificationCount: int("livenessVerificationCount").default(0),
  lastLivenessAttemptAt: timestamp("lastLivenessAttemptAt"),
  failedLivenessAttempts: int("failedLivenessAttempts").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserLiveness = typeof usersWithLiveness.$inferSelect;
export type InsertUserLiveness = typeof usersWithLiveness.$inferInsert;
// Export from other schema files
export * from "./schema_ai_arbitrator";
export * from "./schema_behavioral_biometrics";
export * from "./schema_diaas";
export * from "./schema_mediator";
export * from "./schema_new_features";
export * from "./schema_smart_escrow";
export * from "./schema_trust_system";
export * from "./schema_wallet_id";
export * from "./schema_fraud_graph";
