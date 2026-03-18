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
 * Smart Escrow Milestones - For services and complex projects
 */
export const escrowMilestones = mysqlTable("escrowMilestones", {
  id: int("id").autoincrement().primaryKey(),
  escrowId: int("escrowId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  status: mysqlEnum("status", ["pending", "in_progress", "completed", "released", "disputed"]).default("pending").notNull(),
  
  // Verification criteria (e.g., GitHub PR, Design Link)
  verificationType: mysqlEnum("verificationType", ["manual", "github_commit", "github_pr", "url_check", "external_api"]).default("manual"),
  verificationData: json("verificationData"), // { repo: "owner/repo", prNumber: 123 }
  
  completedAt: timestamp("completedAt"),
  releasedAt: timestamp("releasedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * IoT Device Integration - For physical goods tracking and condition monitoring
 */
export const iotDevices = mysqlTable("iotDevices", {
  id: int("id").autoincrement().primaryKey(),
  escrowId: int("escrowId").notNull(),
  deviceId: varchar("deviceId", { length: 100 }).notNull(), // Unique hardware ID
  deviceType: mysqlEnum("deviceType", ["gps_tracker", "temp_sensor", "humidity_sensor", "impact_sensor", "smart_lock"]).notNull(),
  secureToken: varchar("secureToken", { length: 255 }).unique().notNull(), // Unique token for device authentication
  encryptedData: json("encryptedData"), // Encrypted sensitive readings (e.g., GPS, temperature)
  
  // Thresholds for automatic release or dispute
  config: json("config"), // { minTemp: 0, maxTemp: 25, targetLocation: { lat: 0, lng: 0 }, radius: 100 }
  
  lastReading: json("lastReading"), // { lat: 32.88, lng: 13.19, temp: 22.5, timestamp: "..." }
  status: mysqlEnum("status", ["active", "inactive", "triggered", "tampered"]).default("active").notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Blockchain Transaction Logs - For immutable transparency
 */
export const blockchainLogs = mysqlTable("blockchainLogs", {
  id: int("id").autoincrement().primaryKey(),
  escrowId: int("escrowId").notNull(),
  action: varchar("action", { length: 100 }).notNull(), // e.g., "FUNDED", "MILESTONE_COMPLETED", "RELEASED"
  txHash: varchar("txHash", { length: 255 }).notNull(), // Transaction hash on the blockchain
  network: varchar("network", { length: 50 }).default("polygon_mumbai"),
  contractAddress: varchar("contractAddress", { length: 255 }),
  
  metadata: json("metadata"), // Additional data stored on-chain
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type EscrowMilestone = typeof escrowMilestones.$inferSelect;
export type InsertEscrowMilestone = typeof escrowMilestones.$inferInsert;

export type IotDevice = typeof iotDevices.$inferSelect;
export type InsertIotDevice = typeof iotDevices.$inferInsert;

export type BlockchainLog = typeof blockchainLogs.$inferSelect;
export type InsertBlockchainLog = typeof blockchainLogs.$inferInsert;

/**
 * Milestone Signatures - For non-repudiation of milestone completion
 */
export const milestoneSignatures = mysqlTable("milestoneSignatures", {
  id: int("id").autoincrement().primaryKey(),
  milestoneId: int("milestoneId").notNull(),
  userId: int("userId").notNull(), // User who signed (buyer or seller)
  signature: text("signature").notNull(), // Digital signature of milestone completion
  signedAt: timestamp("signedAt").defaultNow().notNull(),
});

export type MilestoneSignature = typeof milestoneSignatures.$inferSelect;
export type InsertMilestoneSignature = typeof milestoneSignatures.$inferInsert;
