import { getDb } from "./db";
import {
  mediatorRequests,
  mediatorMessages,
  mediatorPrivateChats,
  mediatorPrivateMessages,
  mediatorDecisions,
  mediatorFreezeLogs,
  InsertMediatorRequest,
  InsertMediatorMessage,
  InsertMediatorPrivateChat,
  InsertMediatorPrivateMessage,
  InsertMediatorDecision,
  InsertMediatorFreezeLog,
} from "../drizzle/schema_mediator";
import { eq, and, desc } from "drizzle-orm";

/**
 * Create a new mediator request
 */
export async function createMediatorRequest(data: InsertMediatorRequest) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db.insert(mediatorRequests).values(data);
}

/**
 * Get mediator request by ID
 */
export async function getMediatorRequestById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [result] = await db
    .select()
    .from(mediatorRequests)
    .where(eq(mediatorRequests.id, id));
  
  return result;
}

/**
 * Get pending mediator requests (for admin/mediator assignment)
 */
export async function getPendingMediatorRequests() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db
    .select()
    .from(mediatorRequests)
    .where(eq(mediatorRequests.status, "pending"))
    .orderBy(desc(mediatorRequests.createdAt));
}

/**
 * Assign mediator to a request
 */
export async function assignMediatorToRequest(requestId: number, mediatorId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db
    .update(mediatorRequests)
    .set({
      mediatorId,
      status: "accepted",
      acceptedAt: new Date(),
    })
    .where(eq(mediatorRequests.id, requestId));
}

/**
 * Update mediator request status
 */
export async function updateMediatorRequestStatus(
  requestId: number,
  status: "pending" | "accepted" | "active" | "resolved" | "cancelled",
  resolution?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const updates: any = { status };
  if (status === "resolved") {
    updates.resolvedAt = new Date();
    if (resolution) updates.resolution = resolution;
  }
  
  return db
    .update(mediatorRequests)
    .set(updates)
    .where(eq(mediatorRequests.id, requestId));
}

/**
 * Add mediator message to conversation
 */
export async function addMediatorMessage(data: InsertMediatorMessage) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db.insert(mediatorMessages).values(data);
}

/**
 * Get mediator messages in a conversation
 */
export async function getMediatorMessagesInConversation(
  conversationId: number,
  limit: number = 50,
  offset: number = 0
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db
    .select()
    .from(mediatorMessages)
    .where(eq(mediatorMessages.conversationId, conversationId))
    .orderBy(desc(mediatorMessages.createdAt))
    .limit(limit)
    .offset(offset);
}

/**
 * Create private chat between mediator and party
 */
export async function createMediatorPrivateChat(data: InsertMediatorPrivateChat) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db.insert(mediatorPrivateChats).values(data);
}

/**
 * Get private chat between mediator and user
 */
export async function getMediatorPrivateChat(mediatorRequestId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [result] = await db
    .select()
    .from(mediatorPrivateChats)
    .where(
      and(
        eq(mediatorPrivateChats.mediatorRequestId, mediatorRequestId),
        eq(mediatorPrivateChats.userId, userId)
      )
    );
  
  return result;
}

/**
 * Add message to private mediator chat
 */
export async function addMediatorPrivateMessage(data: InsertMediatorPrivateMessage) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db.insert(mediatorPrivateMessages).values(data);
}

/**
 * Get messages from private mediator chat
 */
export async function getMediatorPrivateChatMessages(
  privateChatId: number,
  limit: number = 50,
  offset: number = 0
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db
    .select()
    .from(mediatorPrivateMessages)
    .where(eq(mediatorPrivateMessages.privateChatId, privateChatId))
    .orderBy(desc(mediatorPrivateMessages.createdAt))
    .limit(limit)
    .offset(offset);
}

/**
 * Create mediator decision
 */
export async function createMediatorDecision(data: InsertMediatorDecision) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db.insert(mediatorDecisions).values(data);
}

/**
 * Get mediator decision for an escrow
 */
export async function getMediatorDecisionByEscrow(escrowId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [result] = await db
    .select()
    .from(mediatorDecisions)
    .where(eq(mediatorDecisions.escrowId, escrowId))
    .orderBy(desc(mediatorDecisions.createdAt));
  
  return result;
}

/**
 * Freeze escrow by mediator
 */
export async function freezeEscrowByMediator(
  mediatorRequestId: number,
  escrowId: number,
  mediatorId: number,
  reason: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db.insert(mediatorFreezeLogs).values({
    mediatorRequestId,
    escrowId,
    mediatorId,
    reason,
  });
}

/**
 * Unfreeze escrow by mediator
 */
export async function unfreezeEscrowByMediator(
  mediatorRequestId: number,
  escrowId: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db
    .update(mediatorFreezeLogs)
    .set({ unfrozenAt: new Date() })
    .where(
      and(
        eq(mediatorFreezeLogs.mediatorRequestId, mediatorRequestId),
        eq(mediatorFreezeLogs.escrowId, escrowId)
      )
    );
}

/**
 * Get mediator requests for a conversation
 */
export async function getMediatorRequestsByConversation(conversationId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db
    .select()
    .from(mediatorRequests)
    .where(eq(mediatorRequests.conversationId, conversationId))
    .orderBy(desc(mediatorRequests.createdAt));
}

/**
 * Get active mediator request for a conversation
 */
export async function getActiveMediatorRequest(conversationId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [result] = await db
    .select()
    .from(mediatorRequests)
    .where(
      and(
        eq(mediatorRequests.conversationId, conversationId),
        eq(mediatorRequests.status, "active")
      )
    );
  
  return result;
}
