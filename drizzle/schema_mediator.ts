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
 * Mediator Requests table - stores requests for mediator assistance
 */
export const mediatorRequests = mysqlTable("mediator_requests", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  escrowId: int("escrowId").notNull(),
  requestedBy: int("requestedBy").notNull(), // User who requested the mediator
  mediatorId: int("mediatorId"), // Assigned mediator
  
  // Status of the mediation request
  status: mysqlEnum("status", [
    "pending", // Waiting for mediator assignment
    "accepted", // Mediator accepted the request
    "active", // Mediator is actively working on the case
    "resolved", // Case resolved by mediator
    "cancelled", // Request cancelled
  ]).default("pending").notNull(),
  
  // Fee for mediator service
  fee: decimal("fee", { precision: 15, scale: 2 }).default("10.00").notNull(),
  feeTransactionId: int("feeTransactionId"), // Link to transaction record for fee payment
  
  // Reason for requesting mediator
  reason: text("reason"),
  
  // Timestamps
  requestedAt: timestamp("requestedAt").defaultNow().notNull(),
  acceptedAt: timestamp("acceptedAt"),
  resolvedAt: timestamp("resolvedAt"),
  
  // Resolution details
  resolution: text("resolution"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MediatorRequest = typeof mediatorRequests.$inferSelect;
export type InsertMediatorRequest = typeof mediatorRequests.$inferInsert;

/**
 * Mediator Messages table - messages sent by mediators in conversations
 * These messages cannot be deleted by regular users
 */
export const mediatorMessages = mysqlTable("mediator_messages", {
  id: int("id").autoincrement().primaryKey(),
  mediatorRequestId: int("mediatorRequestId").notNull(),
  conversationId: int("conversationId").notNull(),
  senderId: int("senderId").notNull(), // The mediator's user ID
  
  // Type of message
  messageType: mysqlEnum("messageType", [
    "text", // Regular text message
    "decision", // Final decision message
    "freeze", // Freeze notification
    "unfreeze", // Unfreeze notification
    "evidence_request", // Request for evidence
  ]).default("text").notNull(),
  
  content: text("content").notNull(),
  
  // System messages are auto-generated (e.g., "Mediator joined")
  isSystemMessage: boolean("isSystemMessage").default(false),
  
  // Mediator messages cannot be deleted by default
  canBeDeleted: boolean("canBeDeleted").default(false),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MediatorMessage = typeof mediatorMessages.$inferSelect;
export type InsertMediatorMessage = typeof mediatorMessages.$inferInsert;

/**
 * Mediator Private Chats table - private conversations between mediator and individual parties
 */
export const mediatorPrivateChats = mysqlTable("mediator_private_chats", {
  id: int("id").autoincrement().primaryKey(),
  mediatorRequestId: int("mediatorRequestId").notNull(),
  mediatorId: int("mediatorId").notNull(),
  userId: int("userId").notNull(), // Either buyer or seller
  
  isActive: boolean("isActive").default(true),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MediatorPrivateChat = typeof mediatorPrivateChats.$inferSelect;
export type InsertMediatorPrivateChat = typeof mediatorPrivateChats.$inferInsert;

/**
 * Mediator Private Messages table - messages in private mediator chats
 */
export const mediatorPrivateMessages = mysqlTable("mediator_private_messages", {
  id: int("id").autoincrement().primaryKey(),
  privateChatId: int("privateChatId").notNull(),
  senderId: int("senderId").notNull(),
  
  content: text("content").notNull(),
  messageType: mysqlEnum("messageType", [
    "text",
    "image",
    "audio",
    "file",
  ]).default("text").notNull(),
  
  mediaUrl: text("mediaUrl"),
  mediaType: varchar("mediaType", { length: 50 }),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MediatorPrivateMessage = typeof mediatorPrivateMessages.$inferSelect;
export type InsertMediatorPrivateMessage = typeof mediatorPrivateMessages.$inferInsert;

/**
 * Mediator Decisions table - final decisions made by mediators
 */
export const mediatorDecisions = mysqlTable("mediator_decisions", {
  id: int("id").autoincrement().primaryKey(),
  mediatorRequestId: int("mediatorRequestId").notNull(),
  escrowId: int("escrowId").notNull(),
  mediatorId: int("mediatorId").notNull(),
  
  // Type of decision
  decisionType: mysqlEnum("decisionType", [
    "release_to_seller", // Release full amount to seller
    "refund_to_buyer", // Refund full amount to buyer
    "split", // Split amount between buyer and seller
    "custom", // Custom distribution
  ]).notNull(),
  
  // Amount distribution
  buyerAmount: decimal("buyerAmount", { precision: 15, scale: 2 }),
  sellerAmount: decimal("sellerAmount", { precision: 15, scale: 2 }),
  
  // Decision details
  reason: text("reason").notNull(),
  evidence: json("evidence"), // JSON array of evidence links/references
  
  // Appeal handling
  isAppealed: boolean("isAppealed").default(false),
  appealReason: text("appealReason"),
  finalDecision: boolean("finalDecision").default(false),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MediatorDecision = typeof mediatorDecisions.$inferSelect;
export type InsertMediatorDecision = typeof mediatorDecisions.$inferInsert;

/**
 * Mediator Freeze Logs table - tracks when escrows are frozen by mediators
 */
export const mediatorFreezeLogs = mysqlTable("mediator_freeze_logs", {
  id: int("id").autoincrement().primaryKey(),
  mediatorRequestId: int("mediatorRequestId").notNull(),
  escrowId: int("escrowId").notNull(),
  mediatorId: int("mediatorId").notNull(),
  
  frozenAt: timestamp("frozenAt").defaultNow().notNull(),
  unfrozenAt: timestamp("unfrozenAt"),
  reason: text("reason"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MediatorFreezeLog = typeof mediatorFreezeLogs.$inferSelect;
export type InsertMediatorFreezeLog = typeof mediatorFreezeLogs.$inferInsert;
