import { TRPCError } from "@trpc/server";
import { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";

/**
 * Rate limiting middleware to prevent brute force attacks
 * Limits requests to 100 per 15 minutes per IP
 */
export const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skip: (req: Request) => {
    // Skip rate limiting for health check endpoints
    return req.path === "/health";
  },
});

/**
 * Strict rate limiting for authentication endpoints
 * Limits requests to 5 per 15 minutes per IP
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many login attempts, please try again later.",
  skipSuccessfulRequests: true, // Don't count successful requests
});

/**
 * Middleware to validate authorization for sensitive operations
 * Ensures user can only access their own data
 */
export function validateUserAccess(userId: number, requestedUserId: number): void {
  if (userId !== requestedUserId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You don't have permission to access this resource",
    });
  }
}

/**
 * Middleware to validate that user is admin
 */
export function validateAdminAccess(userRole: string): void {
  if (userRole !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }
}

/**
 * Middleware to validate financial transaction integrity
 * Ensures amounts are positive and within reasonable limits
 */
export function validateFinancialAmount(amount: string, maxAmount: string = "999999999.99"): void {
  const numAmount = parseFloat(amount);
  const numMax = parseFloat(maxAmount);

  if (isNaN(numAmount) || numAmount <= 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Amount must be a positive number",
    });
  }

  if (numAmount > numMax) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Amount exceeds maximum limit of ${maxAmount}`,
    });
  }
}

/**
 * Middleware to detect suspicious activity
 * Flags unusual patterns like rapid transactions
 */
export function detectSuspiciousActivity(
  userId: number,
  activityType: string,
  recentActivityCount: number
): boolean {
  // Flag if user creates more than 10 transactions in 1 minute
  if (activityType === "transaction" && recentActivityCount > 10) {
    console.warn(`Suspicious activity detected for user ${userId}: ${recentActivityCount} transactions in 1 minute`);
    return true;
  }

  // Flag if user requests withdrawal more than 5 times in 1 hour
  if (activityType === "withdrawal" && recentActivityCount > 5) {
    console.warn(`Suspicious activity detected for user ${userId}: ${recentActivityCount} withdrawal requests in 1 hour`);
    return true;
  }

  return false;
}

/**
 * Middleware to validate email format
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Middleware to validate phone number format (Libyan format)
 */
export function validatePhoneNumber(phone: string): boolean {
  // Libyan phone numbers typically start with +218 or 0
  const phoneRegex = /^(\+218|0)[0-9]{9}$/;
  return phoneRegex.test(phone.replace(/\s/g, ""));
}
