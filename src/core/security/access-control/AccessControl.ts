import { TRPCError } from "@trpc/server";

/**
 * Access Control Service
 * Centralized security logic for ownership and permission checks.
 * No business logic here, only security rules.
 */
export class AccessControl {
  /**
   * Ensures the user is either the buyer or the seller of an escrow.
   */
  public static ensureEscrowParticipant(userId: number, escrow: { buyerId: number; sellerId: number }): void {
    if (escrow.buyerId !== userId && escrow.sellerId !== userId) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Access denied: You are not a participant in this escrow.",
      });
    }
  }

  /**
   * Ensures the user is the owner of a specific resource.
   */
  public static ensureOwnership(userId: number, ownerId: number): void {
    if (userId !== ownerId) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Access denied: You do not own this resource.",
      });
    }
  }

  /**
   * Ensures the user has a specific role.
   */
  public static ensureRole(userRole: string, requiredRole: string): void {
    if (userRole !== requiredRole) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Access denied: Required role: ${requiredRole}`,
      });
    }
  }
}
