/**
 * Verification Notifications Service
 * Sends real-time notifications to users about their verification status
 */

import { TRPCError } from "@trpc/server";
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
    // Don't throw error to prevent verification flow from failing
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
 * Send notification when ID upload is successful
 * @param userId - User ID
 * @param confidence - Confidence score of OCR
 */
export async function notifyIdUploadSuccess(userId: number, confidence: number): Promise<void> {
  const confidenceText = confidence >= 90 ? "عالية جداً" : confidence >= 80 ? "عالية" : "متوسطة";
  
  await sendVerificationNotification({
    userId,
    type: "verification_success",
    title: "تم رفع بطاقة الهوية بنجاح",
    message: `تم استخراج بيانات بطاقة الهويتك بنجاح بدرجة ثقة ${confidenceText} (${confidence}%). يمكنك الآن الانتقال إلى الخطوة التالية.`,
    link: "/verify",
    metadata: { confidence },
  });
}

/**
 * Send notification when ID upload fails
 * @param userId - User ID
 * @param reason - Reason for failure
 */
export async function notifyIdUploadFailed(userId: number, reason: string): Promise<void> {
  await sendVerificationNotification({
    userId,
    type: "verification_failed",
    title: "فشل رفع بطاقة الهوية",
    message: `فشل رفع بطاقة الهويتك. السبب: ${reason}. يرجى التأكد من وضوح الصورة ومحاولة مرة أخرى.`,
    link: "/verify",
  });
}

/**
 * Send notification when face matching is successful
 * @param userId - User ID
 * @param matchScore - Face match score
 * @param livenessScore - Liveness detection score (if available)
 */
export async function notifyFaceMatchSuccess(userId: number, matchScore: number, livenessScore?: number): Promise<void> {
  const matchText = matchScore >= 95 ? "ممتازة" : "عالية";
  let message = `تم التحقق من هويتك بنجاح! درجة تطابق الوجه: ${matchText} (${matchScore}%).`;
  
  if (livenessScore !== undefined && livenessScore >= 80) {
    message += ` تم التحقق من أن الصورة حية بنجاح (${livenessScore}%).`;
  }

  await sendVerificationNotification({
    userId,
    type: "verification_success",
    title: "تم التحقق من هويتك بنجاح!",
    message: message + " حسابك الآن مفعّل بالكامل.",
    link: "/dashboard",
    metadata: { matchScore, livenessScore },
  });
}

/**
 * Send notification when face matching fails
 * @param userId - User ID
 * @param reason - Reason for failure
 * @param warnings - List of warnings
 */
export async function notifyFaceMatchFailed(userId: number, reason: string, warnings?: string[]): Promise<void> {
  let message = `فشل التحقق من هويتك. السبب: ${reason}. يرجى محاولة مرة أخرى.`;
  
  if (warnings && warnings.length > 0) {
    message += ` ملاحظات: ${warnings.join(", ")}`;
  }

  await sendVerificationNotification({
    userId,
    type: "verification_warning",
    title: "فشل التحقق من الوجه",
    message,
    link: "/verify",
    metadata: { warnings },
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
 * Send notification when verification is flagged for review
 * @param userId - User ID
 * @param reason - Reason for flagging
 */
export async function notifyVerificationFlagged(userId: number, reason: string): Promise<void> {
  await sendVerificationNotification({
    userId,
    type: "verification_warning",
    title: "تم وضع طلب التحقق تحت المراجعة",
    message: `تم وضع طلب التحقق من هويتك تحت المراجعة. السبب: ${reason}. سيتم إخطارك بالنتيجة قريباً.`,
    link: "/dashboard",
  });
}

/**
 * Send notification with verification status summary
 * @param userId - User ID
 * @param verificationLevel - Current verification level (0-3)
 */
export async function notifyVerificationStatusUpdate(userId: number, verificationLevel: number): Promise<void> {
  const levelDescriptions: Record<number, string> = {
    0: "لم يتم التحقق",
    1: "تم التحقق من الهاتف",
    2: "تم رفع بطاقة الهوية",
    3: "تم التحقق الكامل",
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

/**
 * Mark notification as read
 * @param notificationId - Notification ID
 */
export async function markNotificationAsRead(notificationId: number): Promise<void> {
  try {
    const db = await getDb();
    if (!db) {
      console.warn("[Notifications] Database not available");
      return;
    }

    await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, notificationId));
  } catch (error) {
    console.error("[Notifications] Error marking notification as read:", error);
  }
}

/**
 * Get unread notifications for a user
 * @param userId - User ID
 * @param limit - Maximum number of notifications to return
 */
export async function getUnreadNotifications(userId: number, limit: number = 10) {
  try {
    const db = await getDb();
    if (!db) {
      console.warn("[Notifications] Database not available");
      return [];
    }

    return await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .limit(limit);
  } catch (error) {
    console.error("[Notifications] Error fetching unread notifications:", error);
    return [];
  }
}
