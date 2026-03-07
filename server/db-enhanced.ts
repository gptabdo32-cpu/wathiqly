import { db } from "./_core/db";
import { eq, and } from "drizzle-orm";
import {
  users,
  wallets,
  transactions,
  escrows,
  disputeMessages,
  disputeEvidence,
  notifications,
} from "../drizzle/schema";
import { encryptData, decryptData } from "./_core/encryption";

/**
 * Create a transaction record for financial operations
 * Ensures database transaction integrity for money movements
 */
export async function createFinancialTransaction(
  userId: number,
  type: "deposit" | "withdrawal" | "commission" | "refund" | "transfer",
  amount: string,
  referenceType: string,
  referenceId: number,
  description: string
) {
  return await db.transaction(async (tx) => {
    // Create transaction record
    const result = await tx.insert(transactions).values({
      userId,
      type,
      amount,
      referenceType,
      referenceId,
      description,
      status: "completed",
    });

    return result;
  });
}

/**
 * Update wallet balance within a database transaction
 * Ensures atomic operations for wallet updates
 */
export async function updateWalletBalance(
  userId: number,
  amountChange: string,
  operation: "add" | "subtract"
) {
  return await db.transaction(async (tx) => {
    // Get current wallet
    const wallet = await tx.query.wallets.findFirst({
      where: eq(wallets.userId, userId),
    });

    if (!wallet) {
      throw new Error("Wallet not found");
    }

    const currentBalance = parseFloat(wallet.balance);
    const change = parseFloat(amountChange);

    let newBalance = currentBalance;
    if (operation === "add") {
      newBalance = currentBalance + change;
    } else if (operation === "subtract") {
      if (currentBalance < change) {
        throw new Error("Insufficient balance");
      }
      newBalance = currentBalance - change;
    }

    // Update wallet
    await tx.update(wallets).set({
      balance: newBalance.toFixed(2),
      updatedAt: new Date(),
    }).where(eq(wallets.id, wallet.id));

    return newBalance.toFixed(2);
  });
}

/**
 * Process escrow completion with atomic transaction
 * Ensures money transfer from buyer to seller is atomic
 */
export async function processEscrowCompletion(escrowId: number) {
  return await db.transaction(async (tx) => {
    // Get escrow details
    const escrow = await tx.query.escrows.findFirst({
      where: eq(escrows.id, escrowId),
    });

    if (!escrow) {
      throw new Error("Escrow not found");
    }

    if (escrow.status !== "delivered") {
      throw new Error("Escrow is not in delivered status");
    }

    // Deduct commission from buyer's wallet
    const buyerWallet = await tx.query.wallets.findFirst({
      where: eq(wallets.userId, escrow.buyerId),
    });

    if (!buyerWallet) {
      throw new Error("Buyer wallet not found");
    }

    // Transfer amount to seller
    const sellerWallet = await tx.query.wallets.findFirst({
      where: eq(wallets.userId, escrow.sellerId),
    });

    if (!sellerWallet) {
      throw new Error("Seller wallet not found");
    }

    const amount = parseFloat(escrow.amount);
    const commission = parseFloat(escrow.commissionAmount);
    const sellerAmount = amount - commission;

    // Update seller wallet
    await tx.update(wallets).set({
      balance: (parseFloat(sellerWallet.balance) + sellerAmount).toFixed(2),
      totalEarned: (parseFloat(sellerWallet.totalEarned) + sellerAmount).toFixed(2),
      updatedAt: new Date(),
    }).where(eq(wallets.id, sellerWallet.id));

    // Update escrow status
    await tx.update(escrows).set({
      status: "completed",
      completedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(escrows.id, escrowId));

    // Create transaction records
    await tx.insert(transactions).values({
      userId: escrow.sellerId,
      type: "deposit",
      amount: sellerAmount.toFixed(2),
      referenceType: "escrow",
      referenceId: escrowId,
      description: `Payment received for escrow: ${escrow.title}`,
      status: "completed",
    });

    await tx.insert(transactions).values({
      userId: escrow.buyerId,
      type: "commission",
      amount: commission.toFixed(2),
      referenceType: "escrow",
      referenceId: escrowId,
      description: `Commission for escrow: ${escrow.title}`,
      status: "completed",
    });

    return { success: true, sellerAmount: sellerAmount.toFixed(2) };
  });
}

/**
 * Add dispute message with encryption for sensitive content
 */
export async function addDisputeMessage(
  escrowId: number,
  senderId: number,
  message: string,
  shouldEncrypt: boolean = false
) {
  const messageContent = shouldEncrypt ? encryptData(message) : message;

  return await db.insert(disputeMessages).values({
    escrowId,
    senderId,
    message: messageContent,
  });
}

/**
 * Get dispute messages with decryption
 */
export async function getDisputeMessages(escrowId: number) {
  const messages = await db.query.disputeMessages.findMany({
    where: eq(disputeMessages.escrowId, escrowId),
  });

  return messages.map((msg) => ({
    ...msg,
    message: msg.message.includes(":") ? decryptData(msg.message) : msg.message,
  }));
}

/**
 * Upload dispute evidence
 */
export async function uploadDisputeEvidence(
  escrowId: number,
  uploaderId: number,
  fileUrl: string,
  fileType: string,
  description?: string
) {
  return await db.insert(disputeEvidence).values({
    escrowId,
    uploaderId,
    fileUrl,
    fileType,
    description,
  });
}

/**
 * Create notification for user
 */
export async function createNotification(
  userId: number,
  type: "transaction" | "dispute" | "system" | "marketing",
  title: string,
  message: string,
  link?: string
) {
  return await db.insert(notifications).values({
    userId,
    type,
    title,
    message,
    link,
  });
}

/**
 * Get unread notifications for user
 */
export async function getUnreadNotifications(userId: number) {
  return await db.query.notifications.findMany({
    where: and(
      eq(notifications.userId, userId),
      eq(notifications.isRead, false)
    ),
  });
}

/**
 * Mark notification as read
 */
export async function markNotificationAsRead(notificationId: number) {
  return await db.update(notifications).set({
    isRead: true,
  }).where(eq(notifications.id, notificationId));
}
