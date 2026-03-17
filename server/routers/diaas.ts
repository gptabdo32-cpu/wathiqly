import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { eq, and, desc } from "drizzle-orm";
import { apiClients, verificationRequests, apiUsageLogs } from "../../drizzle/schema_diaas";
import { users } from "../../drizzle/schema";
import { extractIdDataFromImage, validateExtractedData } from "../_core/ocr";
import { compareFaces, validateFaceComparison, calculateRiskScore } from "../_core/faceRecognition";
import { assessFraudRisk, isSuspiciousFaceImage, checkDuplicateNationalId } from "../_core/fraudDetection";
import { generateOTP } from "../_core/utils";
import { authenticateBusinessClient, authorizeScope, generateClientCredentials } from "../_core/diaas_auth";

/**
 * DIaaS Router - Digital ID as a Service for Business
 * Handles identity verification requests from third-party businesses
 */
export const diaasRouter = router({
  // 1. Business Client Management (Internal/Admin use)
  registerClient: protectedProcedure
    .input(z.object({
      clientName: z.string().min(2),
      businessCategory: z.string().optional(),
      contactEmail: z.string().email(),
      allowedScopes: z.array(z.string()).default(["identity_verify", "fraud_check"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, user } = ctx;
      
      // Ensure only admins can register business clients
      if (user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can register business clients.",
        });
      }

      const { clientId, clientSecret } = generateClientCredentials();
      const clientSecretHash = ctx.encryption.hashData(clientSecret);

      await db.insert(apiClients).values({
        clientName: input.clientName,
        clientId,
        clientSecretHash,
        businessCategory: input.businessCategory,
        contactEmail: input.contactEmail,
        allowedScopes: input.allowedScopes,
      });

      return {
        success: true,
        clientId,
        clientSecret, // ONLY returned once during registration
        message: "Business client registered successfully. Please save the client secret safely.",
      };
    }),

  // 2. Identity Verification API (Business Client use)
  initiateVerification: publicProcedure
    .input(z.object({
      clientId: z.string(),
      clientSecret: z.string(),
      clientReferenceId: z.string().optional(),
      fullName: z.string(),
      nationalIdNumber: z.string(),
      idCardImageUrl: z.string().url(),
      selfieImageUrl: z.string().url(),
      callbackUrl: z.string().url().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;
      const startTime = Date.now();

      // 1. Authenticate and Authorize Business Client
      const businessClient = await authenticateBusinessClient(input.clientId, input.clientSecret);
      authorizeScope(businessClient, "identity_verify");

      // 2. Process Verification (Internal Logic)
      try {
        // a. OCR Extraction
        const extractedData = await extractIdDataFromImage(input.idCardImageUrl);
        
        // b. Face Matching
        const faceComparisonResult = await compareFaces(
          input.idCardImageUrl,
          input.selfieImageUrl
        );

        // c. Fraud Assessment
        const isSuspicious = isSuspiciousFaceImage(
          faceComparisonResult.matchScore,
          faceComparisonResult.livenessScore,
          faceComparisonResult.warnings
        );

        const nationalIdNumberHash = ctx.encryption.hashData(input.nationalIdNumber);
        const duplicateCheck = await checkDuplicateNationalId(nationalIdNumberHash);
        
        // Simplified fraud risk for DIaaS (can be expanded)
        const fraudAssessment = {
          riskScore: calculateRiskScore(faceComparisonResult) + (duplicateCheck ? 50 : 0),
          isSuspicious,
          hasDuplicate: !!duplicateCheck,
          flags: faceComparisonResult.warnings.map(w => ({ type: "ai_warning", severity: "warning", description: w }))
        };

        // d. Determine Status
        let status: "approved" | "rejected" | "flagged" = "approved";
        if (fraudAssessment.riskScore > 70 || isSuspicious) {
          status = "rejected";
        } else if (fraudAssessment.riskScore > 30 || !validateFaceComparison(faceComparisonResult)) {
          status = "flagged";
        }

        // 3. Save Request to Database
        const nationalIdNumberEncrypted = ctx.encryption.encryptData(input.nationalIdNumber);
        
        const [inserted] = await db.insert(verificationRequests).values({
          clientId: businessClient.id,
          clientReferenceId: input.clientReferenceId,
          fullName: input.fullName,
          nationalIdNumberEncrypted,
          idCardImageUrl: input.idCardImageUrl,
          selfieImageUrl: input.selfieImageUrl,
          status,
          overallConfidence: extractedData.confidence,
          faceMatchScore: faceComparisonResult.matchScore,
          fraudRiskScore: fraudAssessment.riskScore,
          extractedData: extractedData as any,
          flags: fraudAssessment.flags as any,
          callbackUrl: input.callbackUrl,
          ipAddress: ctx.req.ip,
          userAgent: ctx.req.headers["user-agent"],
        });

        // 4. Log Usage
        await db.insert(apiUsageLogs).values({
          clientId: businessClient.id,
          endpoint: "/diaas/initiateVerification",
          method: "POST",
          statusCode: 200,
          responseTimeMs: Date.now() - startTime,
          ipAddress: ctx.req.ip,
        });

        return {
          success: true,
          verificationId: inserted.insertId,
          status,
          overallConfidence: extractedData.confidence,
          fraudRiskScore: fraudAssessment.riskScore,
          message: `Verification ${status} successfully.`,
        };

      } catch (error) {
        console.error("[DIaaS] Verification Error:", error);
        
        // Log Failed Usage
        await db.insert(apiUsageLogs).values({
          clientId: businessClient.id,
          endpoint: "/diaas/initiateVerification",
          method: "POST",
          statusCode: 500,
          responseTimeMs: Date.now() - startTime,
          ipAddress: ctx.req.ip,
        });

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "An error occurred during the verification process.",
        });
      }
    }),

  // 3. Get Verification Status
  getVerificationStatus: publicProcedure
    .input(z.object({
      clientId: z.string(),
      clientSecret: z.string(),
      verificationId: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      const { db } = ctx;

      // 1. Authenticate Business Client
      const businessClient = await authenticateBusinessClient(input.clientId, input.clientSecret);

      // 2. Fetch Verification Request
      const request = await db.select().from(verificationRequests).where(
        and(
          eq(verificationRequests.id, input.verificationId),
          eq(verificationRequests.clientId, businessClient.id)
        )
      ).limit(1);

      if (request.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Verification request not found." });
      }

      const req = request[0];

      return {
        verificationId: req.id,
        status: req.status,
        overallConfidence: req.overallConfidence,
        faceMatchScore: req.faceMatchScore,
        fraudRiskScore: req.fraudRiskScore,
        rejectionReason: req.rejectionReason,
        flags: req.flags,
        extractedData: req.extractedData,
        createdAt: req.createdAt,
      };
    }),

  // 4. Business Client Stats (For Business Dashboard)
  getClientStats: publicProcedure
    .input(z.object({
      clientId: z.string(),
      clientSecret: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const { db } = ctx;

      // 1. Authenticate Business Client
      const businessClient = await authenticateBusinessClient(input.clientId, input.clientSecret);

      // 2. Fetch Stats
      const allRequests = await db.select().from(verificationRequests).where(eq(verificationRequests.clientId, businessClient.id));
      
      const stats = {
        totalRequests: allRequests.length,
        approved: allRequests.filter(r => r.status === "approved").length,
        rejected: allRequests.filter(r => r.status === "rejected").length,
        flagged: allRequests.filter(r => r.status === "flagged").length,
        pending: allRequests.filter(r => r.status === "pending").length,
      };

      // 3. Fetch Recent Usage
      const recentUsage = await db.select().from(apiUsageLogs)
        .where(eq(apiUsageLogs.clientId, businessClient.id))
        .orderBy(desc(apiUsageLogs.createdAt))
        .limit(10);

      return {
        clientName: businessClient.clientName,
        businessCategory: businessClient.businessCategory,
        stats,
        recentUsage,
      };
    }),
});
