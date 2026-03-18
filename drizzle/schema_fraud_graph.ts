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
import { users } from "./schema";

/**
 * Fraud Graph Nodes Table
 * Stores entities in the graph (Users, Devices, IPs)
 */
export const fraudNodes = mysqlTable("fraud_nodes", {
  id: int("id").autoincrement().primaryKey(),
  nodeType: mysqlEnum("nodeType", ["user", "device", "ip", "wallet"]).notNull(),
  nodeValue: varchar("nodeValue", { length: 255 }).notNull(), // userId, deviceId, ipAddress, or walletId
  riskScore: decimal("riskScore", { precision: 5, scale: 2 }).default("0.00"),
  metadata: json("metadata"), // Additional info like last seen, location, etc.
  isBlacklisted: boolean("isBlacklisted").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Fraud Graph Edges Table
 * Stores relationships between entities
 */
export const fraudEdges = mysqlTable("fraud_edges", {
  id: int("id").autoincrement().primaryKey(),
  sourceNodeId: int("sourceNodeId").notNull().references(() => fraudNodes.id),
  targetNodeId: int("targetNodeId").notNull().references(() => fraudNodes.id),
  edgeType: mysqlEnum("edgeType", [
    "used_by",      // User used Device/IP
    "transacted_with", // User transacted with User
    "belongs_to",   // Wallet belongs to User
    "shared_with",  // Device shared between Users
  ]).notNull(),
  weight: decimal("weight", { precision: 5, scale: 2 }).default("1.00"), // Strength of connection
  firstSeen: timestamp("firstSeen").defaultNow().notNull(),
  lastSeen: timestamp("lastSeen").defaultNow().onUpdateNow().notNull(),
  metadata: json("metadata"), // e.g., transaction IDs, session IDs
});

/**
 * Fraud Clusters Table
 * Stores detected "fraud rings" or suspicious groups
 */
export const fraudClusters = mysqlTable("fraud_clusters", {
  id: int("id").autoincrement().primaryKey(),
  clusterType: mysqlEnum("clusterType", ["sybil_attack", "money_laundering", "multi_accounting"]).notNull(),
  riskLevel: mysqlEnum("riskLevel", ["low", "medium", "high", "critical"]).notNull(),
  nodesCount: int("nodesCount").notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["detected", "under_review", "confirmed", "dismissed"]).default("detected").notNull(),
  aiAnalysis: text("aiAnalysis"), // Detailed reasoning from AI
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Cluster Members Mapping
 */
export const fraudClusterMembers = mysqlTable("fraud_cluster_members", {
  id: int("id").autoincrement().primaryKey(),
  clusterId: int("clusterId").notNull().references(() => fraudClusters.id),
  nodeId: int("nodeId").notNull().references(() => fraudNodes.id),
  roleInCluster: varchar("roleInCluster", { length: 50 }), // e.g., "hub", "spoke", "bridge"
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FraudNode = typeof fraudNodes.$inferSelect;
export type InsertFraudNode = typeof fraudNodes.$inferInsert;
export type FraudEdge = typeof fraudEdges.$inferSelect;
export type InsertFraudEdge = typeof fraudEdges.$inferInsert;
export type FraudCluster = typeof fraudClusters.$inferSelect;
export type InsertFraudCluster = typeof fraudClusters.$inferInsert;
export type FraudClusterMember = typeof fraudClusterMembers.$inferSelect;
export type InsertFraudClusterMember = typeof fraudClusterMembers.$inferInsert;
