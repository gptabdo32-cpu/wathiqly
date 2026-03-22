import { Escrow } from "../Escrow";

export interface MilestoneProps {
  title: string;
  description?: string;
  amount: string;
  verificationType: "manual" | "github_commit" | "github_pr" | "url_check" | "external_api";
  verificationData?: any;
  requiresSignature: boolean;
}

/**
 * Smart Escrow Domain Service
 * Pure logic for smart escrow features (Milestones, IoT, AI Analysis rules)
 */
export class SmartEscrowDomainService {
  /**
   * Validates if milestones can be added to an escrow
   */
  public static validateMilestones(escrow: Escrow, milestones: MilestoneProps[]): void {
    if (escrow.status !== "PENDING" && escrow.status !== "LOCKED") {
      throw new Error("Cannot add milestones to escrow in current status");
    }

    if (milestones.length === 0) {
      throw new Error("At least one milestone is required");
    }

    const totalMilestoneAmount = milestones.reduce(
      (sum, m) => sum + parseFloat(m.amount),
      0
    );

    const escrowAmount = parseFloat(escrow.amount);
    if (Math.abs(totalMilestoneAmount - escrowAmount) > 0.01) {
      throw new Error("Total milestone amount must equal escrow amount");
    }
  }

  /**
   * Logic for AI Arbitrator Analysis rules
   */
  public static canRequestAiAnalysis(escrow: Escrow, userId: number): boolean {
    return escrow.buyerId === userId || escrow.sellerId === userId;
  }

  /**
   * Logic for IoT Device Registration rules
   */
  public static canRegisterIotDevice(escrow: Escrow, userId: number): boolean {
    // Only seller can usually register tracking devices, or buyer for monitoring
    return escrow.buyerId === userId || escrow.sellerId === userId;
  }
}
