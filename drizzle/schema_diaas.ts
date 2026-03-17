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
import { users } from "./schema";

/**
 * API Clients table - for businesses using Wathiqly DIaaS
 * Follows OAuth 2.0 Client Credentials standards
 */
export const apiClients = mysqlTable("api_clients", {
  id: int("id").autoincrement().primaryKey(),
  
  clientName: varchar("clientName", { length: 255 }).notNull(),
  clientId: varchar("clientId", { length: 64 }).notNull().unique(),
  clientSecretHash: varchar("clientSecretHash", { length: 255 }).notNull(),
  
  // Allowed redirect URIs (for future SSO/OAuth flows)
  redirectUris: json("redirectUris"),
  
  // Scopes: identity_verify, fraud_check, ocr_only, face_match_only
  allowedScopes: json("allowedScopes").notNull(),
  
  // Business category for customized KYC (e.g., "banking", "insurance", "ecommerce")
  businessCategory: varchar("businessCategory", { length: 100 }),
  
  // Contact info
  contactEmail: varchar("contactEmail", { length: 320 }),
  
  isActive: boolean("isActive").default(true),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ApiClient = typeof apiClients.$inferSelect;
export type InsertApiClient = typeof apiClients.$inferInsert;

/**
 * Verification Requests table - tracks all DIaaS API verification attempts
 */
export const verificationRequests = mysqlTable("verification_requests", {
  id: int("id").autoincrement().primaryKey(),
  
  clientId: int("clientId").notNull(),
  clientReferenceId: varchar("clientReferenceId", { length: 100 }), // Client's internal reference
  
  // Optional link to a Wathiqly user if they already exist
  userId: int("userId"),
  
  // Input data (provided by client)
  fullName: text("fullName"),
  nationalIdNumberEncrypted: text("nationalIdNumberEncrypted"),
  idCardImageUrl: text("idCardImageUrl"),
  selfieImageUrl: text("selfieImageUrl"),
  
  // Status and results
  status: mysqlEnum("status", ["pending", "processing", "approved", "rejected", "flagged", "failed"]).default("pending").notNull(),
  
  // AI Metrics
  overallConfidence: decimal("overallConfidence", { precision: 5, scale: 2 }),
  faceMatchScore: decimal("faceMatchScore", { precision: 5, scale: 2 }),
  fraudRiskScore: decimal("fraudRiskScore", { precision: 5, scale: 2 }),
  
  // Extracted data (OCR results)
  extractedData: json("extractedData"),
  
  // Rejection/Flagging info
  rejectionReason: text("rejectionReason"),
  flags: json("flags"), // Array of FraudFlag objects
  
  // Webhook for async notification
  callbackUrl: text("callbackUrl"),
  callbackSent: boolean("callbackSent").default(false),
  callbackResponseCode: int("callbackResponseCode"),
  
  // Metadata
  ipAddress: varchar("ipAddress", { length: 45 }),
  userAgent: text("userAgent"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type VerificationRequest = typeof verificationRequests.$inferSelect;
export type InsertVerificationRequest = typeof verificationRequests.$inferInsert;

/**
 * API Usage Logs - for monitoring and billing
 */
export const apiUsageLogs = mysqlTable("api_usage_logs", {
  id: int("id").autoincrement().primaryKey(),
  
  clientId: int("clientId").notNull(),
  endpoint: varchar("endpoint", { length: 255 }).notNull(),
  method: varchar("method", { length: 10 }).notNull(),
  statusCode: int("statusCode").notNull(),
  
  responseTimeMs: int("responseTimeMs"),
  
  ipAddress: varchar("ipAddress", { length: 45 }),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ApiUsageLog = typeof apiUsageLogs.$inferSelect;
export type InsertApiUsageLog = typeof apiUsageLogs.$inferInsert;
