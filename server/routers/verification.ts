import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { generateOTP, sendSMS } from "../_core/utils";
import {
  notifyPhoneVerificationSuccess,
  notifyPhoneVerificationFailed,
  notifyVerificationStatusUpdate,
} from "../_core/verificationNotifications";

export const verificationRouter = router({
  sendOtp: publicProcedure
    .input(z.object({ phone: z.string().min(10).max(20) }))
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;
      const { phone } = input;

      const user = await db.select().from(users).where(eq(users.phone, phone)).limit(1);

      if (!user || user.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User with this phone number not found.",
        });
      }

      const otp = generateOTP(); 
      const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // OTP valid for 5 minutes

      await db.update(users).set({ otpCode: otp, otpExpiresAt }).where(eq(users.phone, phone));

      // Simulate sending SMS
      await sendSMS(phone, `Your Wathiqly verification code is: ${otp}`); 

      return { success: true, message: "OTP sent successfully." };
    }),

  checkOtp: publicProcedure
    .input(z.object({ phone: z.string().min(10).max(20), otp: z.string().min(6).max(6) }))
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;
      const { phone, otp } = input;

      const user = await db.select().from(users).where(eq(users.phone, phone)).limit(1);

      if (!user || user.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User with this phone number not found.",
        });
      }

      const storedUser = user[0];

      if (!storedUser.otpCode || !storedUser.otpExpiresAt) {
        await notifyPhoneVerificationFailed(storedUser.id, "لم يتم إرسال رمز التحقق");
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No OTP sent for this phone number.",
        });
      }

      if (storedUser.otpExpiresAt < new Date()) {
        await notifyPhoneVerificationFailed(storedUser.id, "انتهت صلاحية رمز التحقق");
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "OTP has expired.",
        });
      }

      if (storedUser.otpCode !== otp) {
        await notifyPhoneVerificationFailed(storedUser.id, "رمز التحقق غير صحيح");
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid OTP.",
        });
      }

      // OTP is valid, mark phone as verified and clear OTP fields
      await db.update(users).set({
        isPhoneVerified: true,
        phoneNumberVerifiedAt: new Date(),
        otpCode: null,
        otpExpiresAt: null,
        verificationLevel: 1, // Level 1: Phone verified
      }).where(eq(users.phone, phone));

      // Send success notification
      await notifyPhoneVerificationSuccess(storedUser.id, phone);
      await notifyVerificationStatusUpdate(storedUser.id, 1);

      return { success: true, message: "Phone number verified successfully." };
    }),

  getStatus: protectedProcedure
    .query(async ({ ctx }) => {
      const { db, user } = ctx;

      const currentUser = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
      if (!currentUser || currentUser.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found.",
        });
      }

      const { isPhoneVerified, verificationLevel } = currentUser[0];

      return {
        isPhoneVerified,
        verificationLevel,
      };
    }),
});
