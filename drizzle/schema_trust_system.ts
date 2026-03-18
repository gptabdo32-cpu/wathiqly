import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  boolean,
  json,
} from "drizzle-orm/mysql-core";

/**
 * User Trust Scores table - stores the dynamic trust score and its components
 */
export const userTrustScores = mysqlTable("user_trust_scores", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  
  // Overall score (0-100)
  currentScore: decimal("currentScore", { precision: 5, scale: 2 }).default("50.00").notNull(),
  
  // Score components (for transparency and debugging)
  transactionFactor: decimal("transactionFactor", { precision: 5, scale: 2 }).default("0.00"),
  kycFactor: decimal("kycFactor", { precision: 5, scale: 2 }).default("0.00"),
  ratingFactor: decimal("ratingFactor", { precision: 5, scale: 2 }).default("0.00"),
  disputePenalty: decimal("disputePenalty", { precision: 5, scale: 2 }).default("0.00"),
  responseFactor: decimal("responseFactor", { precision: 5, scale: 2 }).default("0.00"),
  
  // Predictive/AI Factor (0-100)
  predictiveFactor: decimal("predictiveFactor", { precision: 5, scale: 2 }).default("50.00"),
  
  // Statistics used for calculation
  successfulTransactionsCount: int("successfulTransactionsCount").default(0),
  totalTransactionsCount: int("totalTransactionsCount").default(0),
  activeDisputesCount: int("activeDisputesCount").default(0),
  resolvedDisputesLostCount: int("resolvedDisputesLostCount").default(0),
  averageResponseTimeMinutes: int("averageResponseTimeMinutes").default(0),
  
  lastCalculatedAt: timestamp("lastCalculatedAt").defaultNow(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserTrustScore = typeof userTrustScores.$inferSelect;
export type InsertUserTrustScore = typeof userTrustScores.$inferInsert;

/**
 * Predictive Trust Profiles - AI-generated insights and risk assessment
 */
export const predictiveTrustProfiles = mysqlTable("predictive_trust_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  
  // Risk assessment
  riskLevel: mysqlEnum("riskLevel", ["low", "medium", "high", "critical"]).default("low").notNull(),
  fraudProbability: decimal("fraudProbability", { precision: 5, scale: 2 }).default("0.00"),
  
  // AI Insights
  behavioralAnalysis: text("behavioralAnalysis"), // AI summary of user behavior
  riskFactors: json("riskFactors"), // List of specific risk indicators identified by AI
  growthPotential: decimal("growthPotential", { precision: 5, scale: 2 }).default("0.00"), // Probability of becoming a high-value/trusted user
  
  // Prediction metadata
  lastAiAnalysisAt: timestamp("lastAiAnalysisAt").defaultNow(),
  modelVersion: varchar("modelVersion", { length: 50 }).default("gemini-2.5-flash"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PredictiveTrustProfile = typeof predictiveTrustProfiles.$inferSelect;
export type InsertPredictiveTrustProfile = typeof predictiveTrustProfiles.$inferInsert;

/**
 * User Activity Metrics - Detailed tracking for predictive analysis
 */
export const userActivityMetrics = mysqlTable("user_activity_metrics", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  metricType: mysqlEnum("metricType", [
    "response_time",      // Time to respond to messages/actions
    "login_frequency",    // How often user logs in
    "transaction_speed",  // Time from creation to completion
    "dispute_rate",       // Calculated rate of disputes
    "profile_completeness" // Percentage of profile filled
  ]).notNull(),
  
  value: decimal("value", { precision: 10, scale: 2 }).notNull(),
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
  
  metadata: json("metadata"),
});

export type UserActivityMetric = typeof userActivityMetrics.$inferSelect;
export type InsertUserActivityMetric = typeof userActivityMetrics.$inferInsert;

/**
 * User Badges table - stores badges earned by users
 */
export const userBadges = mysqlTable("user_badges", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  badgeType: mysqlEnum("badgeType", [
    "trusted_seller",      // High trust score + many sales
    "excellent_buyer",     // High trust score + many purchases
    "kyc_verified",        // Fully verified identity
    "dispute_free",        // No disputes in last 50 transactions
    "fast_responder",      // Average response < 15 mins
    "golden_member",       // Top 1% of users
    "predictive_star",     // High AI-predicted reliability
  ]).notNull(),
  
  issuedAt: timestamp("issuedAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt"), // Some badges might be temporary
  
  metadata: json("metadata"), // Additional info like "level" or "reason"
  
  isActive: boolean("isActive").default(true),
});

export type UserBadge = typeof userBadges.$inferSelect;
export type InsertUserBadge = typeof userBadges.$inferInsert;

/**
 * Trust Score History - for tracking score changes over time
 */
export const trustScoreHistory = mysqlTable("trust_score_history", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  oldScore: decimal("oldScore", { precision: 5, scale: 2 }).notNull(),
  newScore: decimal("newScore", { precision: 5, scale: 2 }).notNull(),
  
  changeReason: varchar("changeReason", { length: 255 }).notNull(), // e.g., "transaction_completed", "ai_prediction_update"
  relatedEntityId: int("relatedEntityId"), // ID of the escrow or dispute that caused the change
  relatedEntityType: varchar("relatedEntityType", { length: 50 }),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TrustScoreHistory = typeof trustScoreHistory.$inferSelect;
export type InsertTrustScoreHistory = typeof trustScoreHistory.$inferInsert;
