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
 * Timed Links table - for "الرابط الموقوت" feature
 * Allows sellers to create pre-configured deal links with expiration time
 */
export const timedLinks = mysqlTable("timedLinks", {
  id: int("id").autoincrement().primaryKey(),
  
  // Link identifier (unique token for sharing)
  linkToken: varchar("linkToken", { length: 64 }).notNull().unique(),
  
  // Creator (seller)
  createdBy: int("createdBy").notNull(),
  
  // Deal details
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  
  // Deal type
  dealType: mysqlEnum("dealType", ["physical", "digital_account", "service"]).default("physical").notNull(),
  
  // Dynamic specifications based on deal type (JSON)
  specifications: json("specifications"),
  
  // Commission details
  commissionPercentage: decimal("commissionPercentage", { precision: 5, scale: 2 }).default("2.5").notNull(),
  commissionPaidBy: mysqlEnum("commissionPaidBy", ["buyer", "seller", "split"]).default("buyer").notNull(),
  
  // Link expiration
  expiresAt: timestamp("expiresAt").notNull(),
  
  // Usage tracking
  isUsed: boolean("isUsed").default(false),
  usedBy: int("usedBy"), // Buyer ID who used the link
  usedAt: timestamp("usedAt"),
  
  // Related escrow (created when link is used)
  escrowId: int("escrowId"),
  
  // Status
  status: mysqlEnum("status", [
    "active",      // Link is active and can be used
    "expired",     // Link has expired
    "used",        // Link has been used to create an escrow
    "cancelled",   // Seller cancelled the link
  ]).default("active").notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TimedLink = typeof timedLinks.$inferSelect;
export type InsertTimedLink = typeof timedLinks.$inferInsert;

/**
 * Dispute Collaterals table - for "محفظة النزاع المحايدة" feature
 * Tracks collateral deposits required when opening a dispute
 */
export const disputeCollaterals = mysqlTable("disputeCollaterals", {
  id: int("id").autoincrement().primaryKey(),
  
  // Related dispute/escrow
  escrowId: int("escrowId").notNull(),
  
  // Who paid the collateral
  paidBy: int("paidBy").notNull(),
  
  // Collateral amount (fixed or percentage-based)
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  
  // Collateral status
  status: mysqlEnum("status", [
    "pending",      // Collateral payment is pending
    "held",         // Collateral is held while dispute is being resolved
    "refunded",     // Collateral was refunded to the payer
    "forfeited",    // Collateral was forfeited (given to the other party or platform)
  ]).default("pending").notNull(),
  
  // Dispute resolution details
  reason: text("reason"), // Why the collateral was forfeited/refunded
  
  // Refund/Forfeiture details
  resolvedAt: timestamp("resolvedAt"),
  resolvedBy: int("resolvedBy"), // Admin ID who resolved
  
  // If forfeited, who receives it
  foreitedTo: int("foreitedTo"), // User ID (seller, buyer, or null for platform)
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DisputeCollateral = typeof disputeCollaterals.$inferSelect;
export type InsertDisputeCollateral = typeof disputeCollaterals.$inferInsert;

/**
 * Dispute Collateral Wallet table - tracks collateral balance per user
 * Similar to the main wallet but specifically for dispute collaterals
 */
export const disputeCollateralWallets = mysqlTable("disputeCollateralWallets", {
  id: int("id").autoincrement().primaryKey(),
  
  userId: int("userId").notNull().unique(),
  
  // Available collateral balance (can be used for disputes)
  availableBalance: decimal("availableBalance", { precision: 15, scale: 2 }).default("0").notNull(),
  
  // Held collateral (currently locked in active disputes)
  heldBalance: decimal("heldBalance", { precision: 15, scale: 2 }).default("0").notNull(),
  
  // Total forfeited (cumulative)
  totalForfeited: decimal("totalForfeited", { precision: 15, scale: 2 }).default("0").notNull(),
  
  // Total refunded (cumulative)
  totalRefunded: decimal("totalRefunded", { precision: 15, scale: 2 }).default("0").notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DisputeCollateralWallet = typeof disputeCollateralWallets.$inferSelect;
export type InsertDisputeCollateralWallet = typeof disputeCollateralWallets.$inferInsert;

/**
 * Platform Settings Extension - stores configuration for new features
 */
export const featureSettings = mysqlTable("featureSettings", {
  id: int("id").autoincrement().primaryKey(),
  
  // Timed Links settings
  timedLinksEnabled: boolean("timedLinksEnabled").default(true),
  timedLinksDefaultExpiration: int("timedLinksDefaultExpiration").default(7200), // 2 hours in seconds
  timedLinksMaxExpiration: int("timedLinksMaxExpiration").default(604800), // 7 days in seconds
  
  // Dispute Collateral settings
  disputeCollateralEnabled: boolean("disputeCollateralEnabled").default(true),
  disputeCollateralAmount: decimal("disputeCollateralAmount", { precision: 15, scale: 2 }).default("5.0").notNull(), // Fixed amount in LYD
  disputeCollateralPercentage: decimal("disputeCollateralPercentage", { precision: 5, scale: 2 }).default("0").notNull(), // Optional percentage of escrow amount
  disputeCollateralForfeitedTo: mysqlEnum("disputeCollateralForfeitedTo", [
    "seller",      // Forfeited collateral goes to seller
    "buyer",       // Forfeited collateral goes to buyer
    "platform",    // Forfeited collateral goes to platform
    "split",       // Split between parties
  ]).default("platform").notNull(),
  
  // Inspection Service settings
  inspectionServiceEnabled: boolean("inspectionServiceEnabled").default(true),
  inspectionDefaultFee: decimal("inspectionDefaultFee", { precision: 15, scale: 2 }).default("20.0").notNull(), // Fee in LYD
  
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FeatureSettings = typeof featureSettings.$inferSelect;
export type InsertFeatureSettings = typeof featureSettings.$inferInsert;

/**
 * Inspection Reports table - for "خدمة المعاينة الميدانية الموثقة" feature
 * Stores detailed inspection reports for physical goods
 */
export const inspectionReports = mysqlTable("inspectionReports", {
  id: int("id").autoincrement().primaryKey(),
  
  // Related escrow or timed link
  escrowId: int("escrowId"),
  timedLinkId: int("timedLinkId"),
  
  // Inspector details
  inspectorId: int("inspectorId").notNull(), // User ID of the inspector/agent
  
  // Report content
  summary: text("summary").notNull(), // Overall summary of condition
  conditionScore: int("conditionScore").default(0), // 1-10 scale
  
  // Detailed findings (JSON)
  // { exterior: string, interior: string, functional: string, defects: string[] }
  findings: json("findings"),
  
  // Media evidence (JSON array of URLs)
  mediaUrls: json("mediaUrls"),
  
  // Verification details
  isVerified: boolean("isVerified").default(false),
  verifiedAt: timestamp("verifiedAt"),
  
  // Status
  status: mysqlEnum("status", [
    "pending",    // Inspector assigned, waiting for inspection
    "completed",  // Inspection done, report submitted
    "approved",   // Buyer approved the report
    "rejected",   // Buyer rejected the report
  ]).default("pending").notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type InspectionReport = typeof inspectionReports.$inferSelect;
export type InsertInspectionReport = typeof inspectionReports.$inferInsert;

/**
 * Inspection Agents table - stores verified inspection points or individuals
 */
export const inspectionAgents = mysqlTable("inspectionAgents", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  
  agentName: varchar("agentName", { length: 255 }).notNull(),
  location: varchar("location", { length: 255 }), // City/Area
  specialties: json("specialties"), // e.g., ["cars", "electronics", "real_estate"]
  
  isAvailable: boolean("isAvailable").default(true),
  rating: decimal("rating", { precision: 3, scale: 2 }).default("0"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type InspectionAgent = typeof inspectionAgents.$inferSelect;
export type InsertInspectionAgent = typeof inspectionAgents.$inferInsert;
