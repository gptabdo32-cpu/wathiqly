import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  json,
} from "drizzle-orm/mysql-core";

/**
 * AI Arbitrator Analysis table - stores AI legal analysis for escrows
 * Follows international legal tech standards for contract analysis
 */
export const aiArbitratorAnalysis = mysqlTable("ai_arbitrator_analysis", {
  id: int("id").autoincrement().primaryKey(),
  
  // Related escrow
  escrowId: int("escrowId").notNull(),
  
  // Analysis version/timestamp
  analysisVersion: varchar("analysisVersion", { length: 50 }).default("1.0.0"),
  
  // Overall assessment
  fairnessScore: int("fairnessScore").notNull(), // 0-100
  legalRiskLevel: mysqlEnum("legalRiskLevel", ["low", "medium", "high", "critical"]).notNull(),
  
  // Detailed findings (JSON)
  // { 
  //   loopholes: string[], 
  //   recommendations: string[], 
  //   clauses_analysis: { clause: string, status: 'fair' | 'unfair' | 'ambiguous', comment: string }[] 
  // }
  analysisResults: json("analysisResults").notNull(),
  
  // Summary in Arabic
  summary: text("summary").notNull(),
  
  // Status of the analysis
  status: mysqlEnum("status", ["pending", "completed", "failed"]).default("pending").notNull(),
  
  // Metadata
  modelUsed: varchar("modelUsed", { length: 100 }),
  tokensUsed: int("tokensUsed"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AiArbitratorAnalysis = typeof aiArbitratorAnalysis.$inferSelect;
export type InsertAiArbitratorAnalysis = typeof aiArbitratorAnalysis.$inferInsert;
