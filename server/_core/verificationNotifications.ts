/**
 * Verification Notifications Service
 * Sends real-time notifications to users about their verification status
 */

import { getDb } from "../db";
import { notifications } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export type NotificationType = "verification_started" | "verification_success" | "verification_failed" | "verification_warning" | "verification_rejected";

export interface VerificationNotification {
  userId: number;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  metadata?: Record<string, any>;
}

/**
 * Send a verification notification to a user
 * @param notification - Notification details
 */
export async function sendVerificationNotification(notification: VerificationNotification): Promise<void> {
  try {
    const db = await getDb();
    if (!db) {
      console.warn("[Notifications] Database not available");
      return;
    }

    // Insert notification into database
    await db.insert(notifications).values({
      userId: notification.userId,
      type: "system",
      title: notification.title,
      message: notification.message,
      link: notification.link,
      isRead: false,
    });

    console.log(`[Notifications] Sent to user ${notification.userId}:`, {
      type: notification.type,
      title: notification.title,
    });
  } catch (error) {
    console.error("[Notifications] Error sending notification:", error);
  }
}

/**
 * Send notification when user starts verification process
 * @param userId - User ID
 */
export async function notifyVerificationStarted(userId: number): Promise<void> {
  await sendVerificationNotification({
    userId,
    type: "verification_started",
    title: "تم بدء عملية التحقق من الهوية",
    message: "تم بدء عملية التحقق من هويتك. يرجى اتباع الخطوات المطلوبة بعناية.",
    link: "/verify",
  });
}

/**
 * Send notification when phone verification is successful
 * @param userId - User ID
 * @param phone - Phone number (partially masked)
 */
export async function notifyPhoneVerificationSuccess(userId: number, phone: string): Promise<void> {
  const maskedPhone = phone.substring(0, 3) + "****" + phone.substring(phone.length - 2);
  
  await sendVerificationNotification({
    userId,
    type: "verification_success",
    title: "تم التحقق من رقم الهاتف بنجاح",
    message: `تم التحقق من رقم الهاتف ${maskedPhone} بنجاح. يمكنك الآن الانتقال إلى الخطوة التالية.`,
    link: "/verify",
  });
}

/**
 * Send notification when phone verification fails
 * @param userId - User ID
 * @param reason - Reason for failure
 */
export async function notifyPhoneVerificationFailed(userId: number, reason: string): Promise<void> {
  await sendVerificationNotification({
    userId,
    type: "verification_failed",
    title: "فشل التحقق من رقم الهاتف",
    message: `فشل التحقق من رقم الهاتف. السبب: ${reason}. يرجى محاولة مرة أخرى.`,
    link: "/verify",
  });
}

/**
 * Send notification when verification is rejected by admin
 * @param userId - User ID
 * @param reason - Reason for rejection
 */
export async function notifyVerificationRejected(userId: number, reason: string): Promise<void> {
  await sendVerificationNotification({
    userId,
    type: "verification_rejected",
    title: "تم رفض طلب التحقق من الهوية",
    message: `تم رفض طلب التحقق من هويتك. السبب: ${reason}. يمكنك إعادة محاولة التحقق مرة أخرى.`,
    link: "/verify",
  });
}

/**
 * Send notification when verification is approved by admin
 * @param userId - User ID
 */
export async function notifyVerificationApproved(userId: number): Promise<void> {
  await sendVerificationNotification({
    userId,
    type: "verification_success",
    title: "تم الموافقة على التحقق من هويتك",
    message: "تم الموافقة على طلب التحقق من هويتك من قبل فريق الإدارة. حسابك الآن مفعّل بالكامل.",
    link: "/dashboard",
  });
}

/**
 * Send notification with verification status summary
 * @param userId - User ID
 * @param verificationLevel - Current verification level (0-1)
 */
export async function notifyVerificationStatusUpdate(userId: number, verificationLevel: number): Promise<void> {
  const levelDescriptions: Record<number, string> = {
    0: "لم يتم التحقق",
    1: "تم التحقق من الهاتف",
  };

  const description = levelDescriptions[verificationLevel] || "حالة غير معروفة";

  await sendVerificationNotification({
    userId,
    type: "verification_success",
    title: "تحديث حالة التحقق",
    message: `تم تحديث حالة التحقق من هويتك. الحالة الحالية: ${description}.`,
    link: "/verify",
    metadata: { verificationLevel },
  });
}
