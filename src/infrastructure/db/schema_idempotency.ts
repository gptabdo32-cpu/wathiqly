import {
  int,
  mysqlTable,
  text,
  timestamp,
  varchar,
  json,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

/**
 * Idempotency Table (Rule 5, 16)
 * MISSION: Prevent duplicate processing of events at the database level.
 * Ensures that even if an event is replayed, the side effects are not repeated.
 */
export const processedEvents = mysqlTable("processed_events", {
  id: int("id").autoincrement().primaryKey(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
  consumerName: varchar("consumerName", { length: 100 }).notNull(), // e.g., "EscrowSaga", "PaymentWorker"
  eventId: varchar("eventId", { length: 64 }).notNull(),
  correlationId: varchar("correlationId", { length: 64 }).notNull(),
  status: varchar("status", { length: 20 }).notNull(), // "SUCCESS", "FAILED"
  result: json("result"), // Optional result of the processing
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  unique_idempotency: uniqueIndex("unique_idempotency_idx").on(table.idempotencyKey, table.consumerName),
}));

export type ProcessedEvent = typeof processedEvents.$inferSelect;
export type InsertProcessedEvent = typeof processedEvents.$inferInsert;
