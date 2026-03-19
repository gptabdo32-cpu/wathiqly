import { int, mysqlTable, text, timestamp, decimal, varchar, uniqueIndex } from "drizzle-orm/mysql-core";
import { idempotencyKeys } from "./schema_idempotency"; // Import idempotencyKeys schema
import { users } from "./schema";
import { escrowContracts } from "./schema_escrow_engine";

/**
 * Ledger Accounts Table
 * Represents various financial accounts (e.g., User Wallets, System Escrow, Revenue).
 * IMPROVEMENT: Removed 'balance' field to avoid Dual Source of Truth.
 * Balance is now dynamically calculated from ledgerEntries.
 */
export const ledgerAccounts = mysqlTable("ledger_accounts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").references(() => users.id),
  name: varchar("name", { length: 255 }).notNull(), // e.g., "Main Wallet", "Escrow Hold"
  type: varchar("type", { length: 50 }).notNull(), // "asset", "liability", "equity", "revenue", "expense"
  currency: varchar("currency", { length: 10 }).default("LYD").notNull(),
  // balance field removed to ensure Ledger Entries are the single source of truth
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Ledger Transactions Table
 * Groups multiple entries into a single atomic financial event.
 * IMPROVEMENT: Added idempotencyKey and explicit escrowContractId foreign key.
 */
export const ledgerTransactions = mysqlTable("ledger_transactions", {
  id: int("id").autoincrement().primaryKey(),
  description: text("description"),
  referenceType: varchar("referenceType", { length: 50 }), // e.g., "escrow", "payout", "deposit"
  referenceId: int("referenceId"), // ID of the related business entity
  
  // IMPROVEMENT: Real Foreign Key for Escrow link
  escrowContractId: int("escrowContractId").references(() => escrowContracts.id),
  
  idempotencyKey: varchar("idempotencyKey", { length: 255 }), // Unique key to prevent double processing
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => {
  return {
    idempotencyKeyIdx: uniqueIndex("idempotency_key_idx").on(table.idempotencyKey),
  };
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

/**
 * Account Balances Cache Table
 * Stores the latest calculated balance for each ledger account to optimize read performance.
 * This is a derived state and should always be updated within the same transaction as ledgerEntries.
 */
export const accountBalancesCache = mysqlTable("account_balances_cache", {
  accountId: int("accountId").references(() => ledgerAccounts.id).primaryKey(),
  balance: decimal("balance", { precision: 20, scale: 4 }).default("0.0000").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AccountBalanceCache = typeof accountBalancesCache.$inferSelect;
