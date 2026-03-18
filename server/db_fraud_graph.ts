import { eq, and, or, sql, desc, inArray } from "drizzle-orm";
import { getDb } from "./db";
import {
  fraudNodes,
  fraudEdges,
  fraudClusters,
  fraudClusterMembers,
  InsertFraudNode,
  InsertFraudEdge,
  InsertFraudCluster,
  InsertFraudClusterMember,
} from "../drizzle/schema_fraud_graph";
import { users } from "../drizzle/schema";

/**
 * Graph AI Engine - Handles relationship mapping and fraud detection
 */

export async function upsertNode(node: InsertFraudNode) {
  const db = await getDb();
  if (!db) return null;

  try {
    // Check if node exists
    const existing = await db
      .select()
      .from(fraudNodes)
      .where(and(eq(fraudNodes.nodeType, node.nodeType), eq(fraudNodes.nodeValue, node.nodeValue)))
      .limit(1);

    if (existing.length > 0) {
      // Update metadata and risk score if needed
      await db
        .update(fraudNodes)
        .set({
          metadata: node.metadata || existing[0].metadata,
          updatedAt: new Date(),
        })
        .where(eq(fraudNodes.id, existing[0].id));
      return existing[0];
    }

    const result = await db.insert(fraudNodes).values(node);
    const [inserted] = await db
      .select()
      .from(fraudNodes)
      .where(eq(fraudNodes.id, result[0].insertId as any))
      .limit(1);
    return inserted;
  } catch (error) {
    console.error("[FraudGraph] Error upserting node:", error);
    return null;
  }
}

export async function addEdge(edge: InsertFraudEdge) {
  const db = await getDb();
  if (!db) return null;

  try {
    // Check if edge exists
    const existing = await db
      .select()
      .from(fraudEdges)
      .where(
        and(
          eq(fraudEdges.sourceNodeId, edge.sourceNodeId),
          eq(fraudEdges.targetNodeId, edge.targetNodeId),
          eq(fraudEdges.edgeType, edge.edgeType)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(fraudEdges)
        .set({
          lastSeen: new Date(),
          weight: sql`${fraudEdges.weight} + 0.1`, // Increase weight on repeat interaction
        })
        .where(eq(fraudEdges.id, existing[0].id));
      return existing[0];
    }

    const result = await db.insert(fraudEdges).values(edge);
    return result;
  } catch (error) {
    console.error("[FraudGraph] Error adding edge:", error);
    return null;
  }
}

/**
 * Detect potential Sybil attack (Multi-accounting)
 * Looks for users sharing the same device or IP address
 */
export async function detectSybilClusters() {
  const db = await getDb();
  if (!db) return [];

  try {
    // Advanced query to find nodes with many "used_by" connections
    // Find Devices/IPs shared by more than 3 users
    const sharedResources = await db
      .select({
        resourceId: fraudEdges.targetNodeId,
        userCount: sql<number>`count(distinct ${fraudEdges.sourceNodeId})`,
      })
      .from(fraudEdges)
      .where(eq(fraudEdges.edgeType, "used_by"))
      .groupBy(fraudEdges.targetNodeId)
      .having(sql`count(distinct ${fraudEdges.sourceNodeId}) > 3`);

    const results = [];
    for (const resource of sharedResources) {
      // Get all users sharing this resource
      const userEdges = await db
        .select({
          userId: fraudEdges.sourceNodeId,
          resourceValue: fraudNodes.nodeValue,
        })
        .from(fraudEdges)
        .innerJoin(fraudNodes, eq(fraudEdges.targetNodeId, fraudNodes.id))
        .where(and(eq(fraudEdges.targetNodeId, resource.resourceId), eq(fraudEdges.edgeType, "used_by")));

      if (userEdges.length > 0) {
        // Create a cluster record
        const clusterResult = await db.insert(fraudClusters).values({
          clusterType: "sybil_attack",
          riskLevel: userEdges.length > 10 ? "critical" : "high",
          nodesCount: userEdges.length + 1, // Users + Shared Resource
          description: `Shared resource (${userEdges[0].resourceValue}) detected between ${userEdges.length} users.`,
          status: "detected",
        });

        const clusterId = clusterResult[0].insertId;

        // Add members to cluster
        for (const edge of userEdges) {
          await db.insert(fraudClusterMembers).values({
            clusterId: clusterId as any,
            nodeId: edge.userId,
            roleInCluster: "spoke",
          });
        }
        
        // Add the shared resource itself
        await db.insert(fraudClusterMembers).values({
          clusterId: clusterId as any,
          nodeId: resource.resourceId,
          roleInCluster: "hub",
        });

        results.push({ clusterId, userCount: userEdges.length });
      }
    }
    return results;
  } catch (error) {
    console.error("[FraudGraph] Error detecting Sybil clusters:", error);
    return [];
  }
}

/**
 * Get full graph for a specific user to visualize or analyze
 */
export async function getUserGraph(userId: number, depth: number = 2) {
  const db = await getDb();
  if (!db) return null;

  try {
    // 1. Find user node
    const userNode = await db
      .select()
      .from(fraudNodes)
      .where(and(eq(fraudNodes.nodeType, "user"), eq(fraudNodes.nodeValue, userId.toString())))
      .limit(1);

    if (userNode.length === 0) return { nodes: [], edges: [] };

    const visitedNodes = new Set<number>([userNode[0].id]);
    const edges: any[] = [];
    let currentLevelNodes = [userNode[0].id];

    for (let d = 0; d < depth; d++) {
      if (currentLevelNodes.length === 0) break;

      const foundEdges = await db
        .select()
        .from(fraudEdges)
        .where(
          or(
            inArray(fraudEdges.sourceNodeId, currentLevelNodes),
            inArray(fraudEdges.targetNodeId, currentLevelNodes)
          )
        );

      const nextLevelNodes: number[] = [];
      for (const edge of foundEdges) {
        edges.push(edge);
        if (!visitedNodes.has(edge.sourceNodeId)) {
          visitedNodes.add(edge.sourceNodeId);
          nextLevelNodes.push(edge.sourceNodeId);
        }
        if (!visitedNodes.has(edge.targetNodeId)) {
          visitedNodes.add(edge.targetNodeId);
          nextLevelNodes.push(edge.targetNodeId);
        }
      }
      currentLevelNodes = nextLevelNodes;
    }

    const nodes = await db
      .select()
      .from(fraudNodes)
      .where(inArray(fraudNodes.id, Array.from(visitedNodes)));

    return { nodes, edges };
  } catch (error) {
    console.error("[FraudGraph] Error fetching user graph:", error);
    return null;
  }
}
