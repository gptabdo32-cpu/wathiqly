import { int, mysqlTable, varchar, timestamp } from "drizzle-orm/mysql-core";

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

  // You might want to add more fields like userId, actionType, etc., for auditing or debugging
  // userId: int("userId").references(() => users.id),
  // actionType: varchar("actionType", { length: 100 }),
});

export type IdempotencyKey = typeof idempotencyKeys.$inferSelect;
