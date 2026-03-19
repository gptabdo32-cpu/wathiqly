import { int, mysqlTable, text, timestamp, varchar, json } from "drizzle-orm/mysql-core";

/**
 * Outbox Table
 * Stores events that need to be reliably processed by external systems (e.g., blockchain, other microservices).
 * Implements the Outbox Pattern to ensure atomicity between local database transactions and external side effects.
 */
export const outboxEvents = mysqlTable("outbox_events", {
  id: int("id").autoincrement().primaryKey(),
  aggregateType: varchar("aggregateType", { length: 100 }).notNull(), // e.g., "escrow", "dispute"
  aggregateId: int("aggregateId").notNull(), // ID of the related entity (e.g., escrowId, disputeId)
  eventType: varchar("eventType", { length: 100 }).notNull(), // e.g., "EscrowLocked", "EscrowReleased"
  payload: json("payload").notNull(), // JSON payload containing event data
  status: varchar("status", { length: 50 }).default("pending").notNull(), // "pending", "processing", "completed", "failed"
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  processedAt: timestamp("processedAt"),
  error: text("error"), // Stores error message if processing fails
});

export type OutboxEvent = typeof outboxEvents.$inferSelect;
