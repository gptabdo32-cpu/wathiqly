import {
  int,
  mysqlTable,
  text,
  timestamp,
  varchar,
  json,
} from "drizzle-orm/mysql-core";

/**
 * Audit Logs Table (Rule 16: Add audit logging for all financial actions)
 * MISSION: Ensure full replayability and auditability of all system actions.
 */
export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  action: varchar("action", { length: 100 }).notNull(), // e.g., "PAYMENT_AUTHORIZATION_STARTED"
  entityType: varchar("entity_type", { length: 100 }).notNull(), // e.g., "escrow", "payment"
  entityId: varchar("entity_id", { length: 64 }).notNull(),
  oldValue: json("old_value"),
  newValue: json("new_value"),
  correlationId: varchar("correlation_id", { length: 64 }).notNull(),
  metadata: json("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;
