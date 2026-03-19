import { int, mysqlTable, varchar, timestamp, json } from "drizzle-orm/mysql-core";

/**
 * Idempotency Keys Table
 * Stores unique keys to prevent duplicate processing of requests.
 * The key should ideally be a hash of (userId + actionType + payload) to ensure uniqueness across different contexts.
 */
export const idempotencyKeys = mysqlTable("idempotency_keys", {
  idempotencyKey: varchar("idempotencyKey", { length: 255 }).primaryKey(), // Composite hash of request parameters
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt"), // Optional: for keys that should expire after a certain time
  transactionId: int("transactionId").references(() => ledgerTransactions.id), // Link to the ledger transaction
  status: varchar("status", { length: 50 }).default("pending").notNull(), // "pending", "completed", "failed"
  responseSnapshot: json("responseSnapshot"), // Stores a snapshot of the response for successful operations
  actionType: varchar("actionType", { length: 100 }), // e.g., "escrow_lock", "escrow_release", "dispute_resolve"
  userId: int("userId"), // User initiating the action
  payloadHash: varchar("payloadHash", { length: 255 }), // Hash of the relevant payload for composite key

  // You might want to add more fields like userId, actionType, etc., for auditing or debugging
  // userId: int("userId").references(() => users.id),
  // actionType: varchar("actionType", { length: 100 }),
});

export type IdempotencyKey = typeof idempotencyKeys.$inferSelect;
