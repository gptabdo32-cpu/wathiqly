import { int, mysqlTable, text, timestamp, decimal, varchar, mysqlEnum } from "drizzle-orm/mysql-core";
import { users } from "./schema";
import { ledgerAccounts } from "./schema_ledger";

/**
 * Escrow Contracts Table
 * Manages the state of locked funds between parties.
 */
export const escrowContracts = mysqlTable("escrow_contracts", {
  id: int("id").autoincrement().primaryKey(),
  buyerId: int("buyerId").references(() => users.id).notNull(),
  sellerId: int("sellerId").references(() => users.id).notNull(),
  
  // Ledger Accounts associated with this contract
  buyerLedgerAccountId: int("buyerLedgerAccountId").references(() => ledgerAccounts.id).notNull(),
  escrowLedgerAccountId: int("escrowLedgerAccountId").references(() => ledgerAccounts.id).notNull(), // System-held account
  
  amount: decimal("amount", { precision: 20, scale: 4 }).notNull(),
  status: mysqlEnum("status", ["pending", "locked", "released", "disputed", "refunded", "cancelled"]).default("pending").notNull(),
  
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Disputes Table
 * Manages conflicts related to escrow contracts.
 */
export const disputes = mysqlTable("disputes", {
  id: int("id").autoincrement().primaryKey(),
  escrowId: int("escrowId").references(() => escrowContracts.id).notNull(),
  initiatorId: int("initiatorId").references(() => users.id).notNull(),
  reason: text("reason").notNull(),
  status: mysqlEnum("status", ["open", "under_review", "resolved", "closed"]).default("open").notNull(),
  resolution: mysqlEnum("resolution", ["buyer_refund", "seller_payout", "split"]).nullable(),
  adminId: int("adminId").references(() => users.id), // Admin handling the dispute
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EscrowContract = typeof escrowContracts.$inferSelect;
export type Dispute = typeof disputes.$inferSelect;
