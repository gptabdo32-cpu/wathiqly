import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { behavioralPatternsTable, behavioralSessionsTable } from "../../drizzle/schema_behavioral_biometrics";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

const BehavioralDataSchema = z.object({
  typing: z.array(z.object({
    key: z.string(),
    dwellTime: z.number(),
    flightTime: z.number(),
    timestamp: z.number(),
  })),
  scroll: z.array(z.object({
    deltaY: z.number(),
    speed: z.number(),
    timestamp: z.number(),
  })),
  orientation: z.array(z.object({
    alpha: z.number().nullable(),
    beta: z.number().nullable(),
    gamma: z.number().nullable(),
    timestamp: z.number(),
  })),
  deviceInfo: z.object({
    userAgent: z.string(),
    screenSize: z.string(),
    platform: z.string(),
  }),
});

export const behavioralRouter = router({
  submitSession: protectedProcedure
    .input(BehavioralDataSchema)
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const userId = ctx.user.id;
      const sessionId = Math.random().toString(36).substring(7);

      // 1. Store the session data
      await db.insert(behavioralSessionsTable).values({
        userId,
        sessionId,
        sessionData: JSON.stringify(input),
        deviceInfo: JSON.stringify(input.deviceInfo),
        ipAddress: ctx.req.ip,
      });

      // 2. Get user's reference pattern
      const [pattern] = await db
        .select()
        .from(behavioralPatternsTable)
        .where(eq(behavioralPatternsTable.userId, userId))
        .limit(1);

      if (!pattern) {
        // First time? Create a pattern if we have enough data
        if (input.typing.length > 10) {
          const avgDwell = input.typing.reduce((sum, t) => sum + t.dwellTime, 0) / input.typing.length;
          const avgFlight = input.typing.reduce((sum, t) => sum + t.flightTime, 0) / input.typing.length;
          
          await db.insert(behavioralPatternsTable).values({
            userId,
            typingPattern: JSON.stringify({ avgDwell, avgFlight }),
            sampleCount: 1,
          });
        }
        return { status: "learning", similarityScore: 100 };
      }

      // 3. Simple Comparison Logic (Typing only for now as a POC)
      if (input.typing.length > 5 && pattern.typingPattern) {
        const refPattern = JSON.parse(pattern.typingPattern);
        const currentAvgDwell = input.typing.reduce((sum, t) => sum + t.dwellTime, 0) / input.typing.length;
        
        // Calculate similarity (simple percentage difference)
        const diff = Math.abs(currentAvgDwell - refPattern.avgDwell) / refPattern.avgDwell;
        const similarityScore = Math.max(0, 100 - (diff * 100));

        // 4. Security Action
        if (similarityScore < 40 && pattern.sampleCount > 5) {
          // High mismatch! Lock account or flag
          await db.update(behavioralPatternsTable)
            .set({ 
              isLocked: true, 
              lastMismatchAt: new Date() 
            })
            .where(eq(behavioralPatternsTable.userId, userId));
            
          return { status: "locked", similarityScore };
        }

        // Update pattern with new data (moving average)
        const newAvgDwell = (refPattern.avgDwell * pattern.sampleCount + currentAvgDwell) / (pattern.sampleCount + 1);
        await db.update(behavioralPatternsTable)
          .set({
            typingPattern: JSON.stringify({ ...refPattern, avgDwell: newAvgDwell }),
            sampleCount: pattern.sampleCount + 1,
          })
          .where(eq(behavioralPatternsTable.userId, userId));

        return { status: "verified", similarityScore };
      }

      return { status: "insufficient_data", similarityScore: 100 };
    }),

  getPatternStatus: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    const [pattern] = await db
      .select()
      .from(behavioralPatternsTable)
      .where(eq(behavioralPatternsTable.userId, ctx.user.id))
      .limit(1);

    return pattern || null;
  }),
});
