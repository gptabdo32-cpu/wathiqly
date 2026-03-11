import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { generateOTP, sendSMS } from "../_core/utils";
import { extractIdDataFromImage, validateExtractedData, sanitizeExtractedData } from "../_core/ocr";


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

      const otp = generateOTP(); // Implement this utility function
      const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // OTP valid for 5 minutes

      await db.update(users).set({ otpCode: otp, otpExpiresAt }).where(eq(users.phone, phone));

      // Simulate sending SMS
      await sendSMS(phone, `Your Wathiqly verification code is: ${otp}`); // Implement this utility function

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
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No OTP sent for this phone number.",
        });
      }

      if (storedUser.otpExpiresAt < new Date()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "OTP has expired.",
        });
      }

      if (storedUser.otpCode !== otp) {
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

      return { success: true, message: "Phone number verified successfully." };
    }),

  uploadId: protectedProcedure
    .input(z.object({
      idCardImageBase64: z.string(), // Base64 encoded image
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, user } = ctx;
      const { idCardImageBase64 } = input;

      // 1. Upload image to storage
      const imageBuffer = Buffer.from(idCardImageBase64, 'base64');
      const imageKey = `identity/${user.id}/id_card_${Date.now()}.png`;
      const { url: idCardImageUrl } = await ctx.storage.put(imageKey, imageBuffer, 'image/png');

      // 2. Extract data using real OCR service
      const extractedData = await extractIdDataFromImage(idCardImageUrl);
      
      // Validate extracted data
      if (!validateExtractedData(extractedData)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Could not reliably extract identity information. Please ensure the image is clear, well-lit, and shows all required information.",
        });
      }

      const extractedFullName = extractedData.fullName;
      const extractedNationalIdNumber = extractedData.nationalIdNumber;

      // 3. Encrypt national ID number
      const nationalIdNumberEncrypted = ctx.encryption.encryptData(extractedNationalIdNumber);
      const nationalIdNumberHash = ctx.encryption.hashData(extractedNationalIdNumber);

      // 4. Check for duplicate national ID
      const existingVerification = await db.select().from(users).where(eq(users.nationalIdNumberEncrypted, nationalIdNumberEncrypted)).limit(1);
      if (existingVerification.length > 0 && existingVerification[0].id !== user.id) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This national ID is already associated with another account.",
        });
      }

      // 5. Store/update verification details
      await db.update(users).set({
        identityDocumentUrl: idCardImageUrl,
        nationalIdNumberEncrypted: nationalIdNumberEncrypted,
        verificationLevel: 2, // Level 2: ID uploaded
      }).where(eq(users.id, user.id));

      // Also save to identity_verifications table for history/anti-fraud
      await db.insert(ctx.schema.identityVerifications).values({
        userId: user.id,
        nationalIdNumberHash: nationalIdNumberHash,
        fullName: extractedFullName,
        idCardImageUrl: idCardImageUrl,
        status: "pending",
        ipAddress: ctx.req.ip,
        userAgent: ctx.req.headers["user-agent"],
      });

      // Log sanitized data for audit purposes
      console.log(`[Verification] ID uploaded for user ${user.id}:`, sanitizeExtractedData(extractedData));

      return { 
        success: true, 
        message: "National ID uploaded successfully.",
        confidence: extractedData.confidence,
        fullName: extractedFullName,
      };
    }),

  uploadSelfie: protectedProcedure
    .input(z.object({
      selfieImageBase64: z.string(), // Base64 encoded image
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, user } = ctx;
      const { selfieImageBase64 } = input;

      // 1. Upload image to storage
      const imageBuffer = Buffer.from(selfieImageBase64, 'base64');
      const imageKey = `identity/${user.id}/selfie_${Date.now()}.png`;
      const { url: selfieImageUrl } = await ctx.storage.put(imageKey, imageBuffer, 'image/png');

      // 2. Update user record with selfie image URL
      await db.update(users).set({
        selfieImageUrl: selfieImageUrl,
      }).where(eq(users.id, user.id));

      return { success: true, message: "Selfie uploaded successfully." };
    }),

  faceMatch: protectedProcedure
    .mutation(async ({ ctx }) => {
      const { db, user } = ctx;

      const currentUser = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
      if (!currentUser || !currentUser[0].identityDocumentUrl || !currentUser[0].selfieImageUrl) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "ID card image or selfie image not found.",
        });
      }

      // Simulate face matching (replace with actual face recognition library)
      const faceMatchScore = Math.floor(Math.random() * (100 - 80 + 1)) + 80; // Random score between 80-100

      let identityVerified = false;
      let verificationLevel = currentUser[0].verificationLevel;

      if (faceMatchScore >= 90) {
        identityVerified = true;
        verificationLevel = 3; // Level 3: Fully verified
      }

      await db.update(users).set({
        faceMatchScore: faceMatchScore,
        isIdentityVerified: identityVerified,
        identityVerifiedAt: identityVerified ? new Date() : null,
        verificationLevel: verificationLevel,
      }).where(eq(users.id, user.id));

      return { success: true, score: faceMatchScore, isVerified: identityVerified, message: "Face matching completed." };
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

      const { isPhoneVerified, isIdentityVerified, verificationLevel, nationalIdNumberEncrypted, identityDocumentUrl, selfieImageUrl, faceMatchScore } = currentUser[0];

      return {
        isPhoneVerified,
        isIdentityVerified,
        verificationLevel,
        nationalIdNumberEncrypted: nationalIdNumberEncrypted ? "********" : null, // Mask sensitive data
        identityDocumentUrl,
        selfieImageUrl,
        faceMatchScore,
      };
    }),
});
