import { int, mysqlTable, text, timestamp, decimal, varchar } from "drizzle-orm/mysql-core";
import { users } from "./schema";

/**
 * Ledger Accounts Table
 * Represents various financial accounts (e.g., User Wallets, System Escrow, Revenue).
 */
export const ledgerAccounts = mysqlTable("ledger_accounts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").references(() => users.id),
  name: varchar("name", { length: 255 }).notNull(), // e.g., "Main Wallet", "Escrow Hold"
  type: varchar("type", { length: 50 }).notNull(), // "asset", "liability", "equity", "revenue", "expense"
  currency: varchar("currency", { length: 10 }).default("LYD").notNull(),
  balance: decimal("balance", { precision: 20, scale: 4 }).default("0.0000").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Ledger Transactions Table
 * Groups multiple entries into a single atomic financial event.
 */
export const ledgerTransactions = mysqlTable("ledger_transactions", {
  id: int("id").autoincrement().primaryKey(),
  description: text("description"),
  referenceType: varchar("referenceType", { length: 50 }), // e.g., "escrow", "payout", "deposit"
  referenceId: int("referenceId"), // ID of the related business entity
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/**
 * Ledger Entries Table (The Heart of the Ledger)
 * Implements Double-Entry Bookkeeping: Every transaction has at least one Debit and one Credit.
 * IMMUTABLE: Once written, these records must never be changed or deleted.
 */
export const ledgerEntries = mysqlTable("ledger_entries", {
  id: int("id").autoincrement().primaryKey(),
  transactionId: int("transactionId").references(() => ledgerTransactions.id).notNull(),
  accountId: int("accountId").references(() => ledgerAccounts.id).notNull(),
  
  // Debit increases assets/expenses, Credit increases liabilities/equity/revenue.
  debit: decimal("debit", { precision: 20, scale: 4 }).default("0.0000").notNull(),
  credit: decimal("credit", { precision: 20, scale: 4 }).default("0.0000").notNull(),
  
  balanceAfter: decimal("balanceAfter", { precision: 20, scale: 4 }).notNull(), // Snapshot for audit
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type LedgerAccount = typeof ledgerAccounts.$inferSelect;
export type LedgerTransaction = typeof ledgerTransactions.$inferSelect;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;
