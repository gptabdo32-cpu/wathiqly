import { OpenAI } from "openai";
import { getDb } from "./db";
import {
  fraudNodes,
  fraudEdges,
  fraudClusters,
  fraudClusterMembers,
} from "../drizzle/schema_fraud_graph";
import { eq, and, sql } from "drizzle-orm";
import { upsertNode, addEdge, detectSybilClusters, getUserGraph } from "./db_fraud_graph";

const openai = new OpenAI();

/**
 * Fraud AI Logic - The "Brain" of the Fraud Detection System
 */

export class FraudDetector {
  /**
   * Record a login event and link user to device/IP
   */
  static async recordLogin(userId: number, deviceInfo: string, ipAddress: string) {
    // 1. Upsert User Node
    const userNode = await upsertNode({
      nodeType: "user",
      nodeValue: userId.toString(),
      metadata: { lastLogin: new Date().toISOString() },
    });

    if (!userNode) return;

    // 2. Upsert Device Node
    const deviceNode = await upsertNode({
      nodeType: "device",
      nodeValue: deviceInfo,
      metadata: { lastSeenIp: ipAddress },
    });

    // 3. Upsert IP Node
    const ipNode = await upsertNode({
      nodeType: "ip",
      nodeValue: ipAddress,
      metadata: { lastSeenDevice: deviceInfo },
    });

    if (deviceNode) {
      await addEdge({
        sourceNodeId: userNode.id,
        targetNodeId: deviceNode.id,
        edgeType: "used_by",
        weight: "1.0",
      });
    }

    if (ipNode) {
      await addEdge({
        sourceNodeId: userNode.id,
        targetNodeId: ipNode.id,
        edgeType: "used_by",
        weight: "1.0",
      });
    }

    // Trigger background analysis for this user
    this.analyzeUserRisk(userId).catch(console.error);
  }

  /**
   * Use AI to analyze the risk level of a user based on their graph
   */
  static async analyzeUserRisk(userId: number) {
    const graph = await getUserGraph(userId, 2);
    if (!graph || graph.nodes.length < 2) return 0;

    // Build context for AI
    const nodesInfo = graph.nodes.map(n => `Node(${n.id}): ${n.nodeType} = ${n.nodeValue}`).join("\n");
    const edgesInfo = graph.edges.map(e => `Edge: ${e.sourceNodeId} --[${e.edgeType}]--> ${e.targetNodeId}`).join("\n");

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content: `You are a Graph Fraud Analyst for "Wathiqly" platform. 
            Analyze the following network graph and return a risk score (0-100) and a brief reasoning in Arabic.
            High risk indicators:
            - One device shared by many users (Sybil attack).
            - One IP shared by many users.
            - Circular transactions between accounts.
            - High-velocity account creation from same resource.
            Return JSON format: { "score": number, "reasoning": "string" }`
          },
          {
            role: "user",
            content: `Graph Data:\nNodes:\n${nodesInfo}\nEdges:\n${edgesInfo}`
          }
        ],
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");
      
      // Update the user's risk score in the database
      const db = await getDb();
      if (db) {
        await db
          .update(fraudNodes)
          .set({
            riskScore: result.score.toString(),
            metadata: sql`JSON_SET(COALESCE(metadata, '{}'), '$.aiReasoning', ${result.reasoning})`,
            updatedAt: new Date(),
          })
          .where(and(eq(fraudNodes.nodeType, "user"), eq(fraudNodes.nodeValue, userId.toString())));
      }

      return result.score;
    } catch (error) {
      console.error("[FraudAI] Error in AI analysis:", error);
      return 0;
    }
  }

  /**
   * Detect "Fraud Rings" (Organized groups)
   */
  static async detectFraudRings() {
    // 1. Use graph algorithms to find clusters
    const sybilClusters = await detectSybilClusters();
    
    // 2. For each cluster, use AI to confirm if it's a fraud ring
    for (const cluster of sybilClusters) {
      const db = await getDb();
      if (!db) continue;

      const clusterData = await db
        .select()
        .from(fraudClusters)
        .where(eq(fraudClusters.id, cluster.clusterId as any))
        .limit(1);

      if (clusterData.length === 0) continue;

      // Ask AI for deeper analysis of the cluster
      const response = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content: "Analyze this detected cluster and determine if it's an organized fraud ring. Return your analysis in Arabic."
          },
          {
            role: "user",
            content: `Cluster Type: ${clusterData[0].clusterType}\nNodes Count: ${clusterData[0].nodesCount}\nDescription: ${clusterData[0].description}`
          }
        ]
      });

      await db
        .update(fraudClusters)
        .set({
          aiAnalysis: response.choices[0].message.content,
          status: "under_review",
        })
        .where(eq(fraudClusters.id, cluster.clusterId as any));
    }
  }
}
