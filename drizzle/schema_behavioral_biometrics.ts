import { int, mysqlTable, text, timestamp, decimal, boolean } from "drizzle-orm/mysql-core";
import { users } from "./schema";

/**
 * Behavioral Biometrics Patterns Table
 * Stores the reference behavioral profile for each user
 */
export const behavioralPatternsTable = mysqlTable("behavioral_patterns", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  
  // Typing patterns (JSON: average dwell time, flight time, error rate)
  typingPattern: text("typingPattern"), 
  
  // Scrolling patterns (JSON: average speed, acceleration, scroll length)
  scrollPattern: text("scrollPattern"),
  
  // Device orientation patterns (JSON: typical tilt angles, stability)
  orientationPattern: text("orientationPattern"),
  
  // Touch/Mouse patterns (JSON: click speed, movement fluidity)
  interactionPattern: text("interactionPattern"),
  
  // Metadata
  sampleCount: int("sampleCount").default(0), // Number of sessions used to build this profile
  isLocked: boolean("isLocked").default(false), // Whether the account is locked due to mismatch
  lastMismatchAt: timestamp("lastMismatchAt"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Behavioral Biometrics Sessions Table
 * Stores individual interaction sessions for analysis and profile building
 */
export const behavioralSessionsTable = mysqlTable("behavioral_sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  sessionId: text("sessionId").notNull(),
  
  // Raw or processed data for this specific session
  sessionData: text("sessionData").notNull(), // JSON
  
  // Analysis results
  similarityScore: decimal("similarityScore", { precision: 5, scale: 2 }), // 0-100
  isSuspicious: boolean("isSuspicious").default(false),
  
  deviceInfo: text("deviceInfo"), // User agent, screen size, etc.
  ipAddress: text("ipAddress"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type BehavioralPattern = typeof behavioralPatternsTable.$inferSelect;
export type InsertBehavioralPattern = typeof behavioralPatternsTable.$inferInsert;
export type BehavioralSession = typeof behavioralSessionsTable.$inferSelect;
export type InsertBehavioralSession = typeof behavioralSessionsTable.$inferInsert;
