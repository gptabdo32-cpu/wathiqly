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
 * P2P Transfers table - tracks instant money transfers between users
 * Follows PCI-DSS standards for transaction tracking
 */
export const p2pTransfers = mysqlTable("p2pTransfers", {
  id: int("id").autoincrement().primaryKey(),
  
  senderId: int("senderId").notNull(),
  receiverId: int("receiverId").notNull(),
  
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  fee: decimal("fee", { precision: 15, scale: 2 }).default("0.00").notNull(),
  
  // Encrypted reference or note for the transfer
  noteEncrypted: text("noteEncrypted"),
  
  // Status of the transfer
  status: mysqlEnum("status", ["pending", "completed", "failed", "reversed"]).default("completed").notNull(),
  
  // Transaction reference for audit logs
  reference: varchar("reference", { length: 100 }).notNull().unique(),
  
  // Security metadata
  ipAddress: varchar("ipAddress", { length: 45 }),
  deviceFingerprint: text("deviceFingerprint"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Bill Payments table - tracks utility and service payments (Libyana, Al-Madar, etc.)
 */
export const billPayments = mysqlTable("billPayments", {
  id: int("id").autoincrement().primaryKey(),
  
  userId: int("userId").notNull(),
  
  serviceProvider: mysqlEnum("serviceProvider", [
    "libyana",      // Mobile/Internet
    "almadar",      // Mobile/Internet
    "ltt",          // Internet
    "gecol",        // Electricity
    "water_auth",   // Water
    "government",   // Government services
  ]).notNull(),
  
  billType: varchar("billType", { length: 50 }).notNull(), // e.g., "topup", "postpaid", "invoice"
  
  // Identifier for the bill (phone number, account number, meter ID)
  billIdentifier: varchar("billIdentifier", { length: 100 }).notNull(),
  
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  
  // Response from the provider's API
  providerReference: varchar("providerReference", { length: 100 }),
  providerResponse: json("providerResponse"),
  
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed", "refunded"]).default("pending").notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Digital Identity SSO Clients - for Wathiqly as a Single Sign-On provider
 * Follows OAuth 2.0 / OpenID Connect standards
 */
export const ssoClients = mysqlTable("ssoClients", {
  id: int("id").autoincrement().primaryKey(),
  
  clientName: varchar("clientName", { length: 255 }).notNull(),
  clientId: varchar("clientId", { length: 64 }).notNull().unique(),
  clientSecretHash: varchar("clientSecretHash", { length: 255 }).notNull(),
  
  redirectUris: json("redirectUris").notNull(), // Array of allowed callback URLs
  
  // Allowed scopes (e.g., "profile", "phone", "identity_status")
  allowedScopes: json("allowedScopes").notNull(),
  
  isActive: boolean("isActive").default(true),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/**
 * SSO Authorizations - tracks which users authorized which third-party apps
 */
export const ssoAuthorizations = mysqlTable("ssoAuthorizations", {
  id: int("id").autoincrement().primaryKey(),
  
  userId: int("userId").notNull(),
  clientId: int("clientId").notNull(),
  
  scopes: json("scopes").notNull(),
  
  lastAuthorizedAt: timestamp("lastAuthorizedAt").defaultNow().notNull(),
  revokedAt: timestamp("revokedAt"),
});

/**
 * Digital Wallet Audit Logs - specialized high-integrity logs for financial operations
 * ISO 27001 compliant logging
 */
export const walletAuditLogs = mysqlTable("walletAuditLogs", {
  id: int("id").autoincrement().primaryKey(),
  
  userId: int("userId").notNull(),
  walletId: int("walletId").notNull(),
  
  action: varchar("action", { length: 50 }).notNull(), // e.g., "transfer_sent", "bill_paid", "balance_adjusted"
  
  previousBalance: decimal("previousBalance", { precision: 15, scale: 2 }).notNull(),
  newBalance: decimal("newBalance", { precision: 15, scale: 2 }).notNull(),
  
  entityType: varchar("entityType", { length: 50 }), // "p2pTransfer", "billPayment"
  entityId: int("entityId"),
  
  metadata: json("metadata"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
