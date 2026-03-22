import { SmartEscrowDomainService, MilestoneProps } from "../../domain/services/SmartEscrowDomainService";
import { IEscrowRepository } from "../../domain/IEscrowRepository";
import { TRPCError } from "@trpc/server";

/**
 * Smart Escrow Application Service
 * Orchestrates smart escrow features (Milestones, IoT, AI Analysis)
 * No business logic here, only coordination.
 */
export class SmartEscrowApplicationService {
  constructor(
    private escrowRepository: IEscrowRepository,
    private auditLogRepository: any, // To be replaced with interface
    private aiArbitratorService: any, // To be replaced with interface
    private iotService: any // To be replaced with interface
  ) {}

  /**
   * Orchestrates adding milestones to an escrow
   */
  public async addMilestones(
    userId: number,
    escrowId: number,
    milestones: MilestoneProps[]
  ): Promise<{ success: boolean }> {
    const escrow = await this.escrowRepository.getById(escrowId);
    if (!escrow) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Escrow not found" });
    }

    // Security check: Only buyer or seller can add milestones
    if (escrow.buyerId !== userId && escrow.sellerId !== userId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized" });
    }

    // Domain logic: Validate milestones
    SmartEscrowDomainService.validateMilestones(escrow, milestones);

    // Infrastructure: Save milestones
    await this.escrowRepository.saveMilestones(escrowId, milestones);

    // Infrastructure: Audit log
    await this.auditLogRepository.create({
      userId,
      action: "milestones_added",
      entityType: "escrow",
      entityId: escrowId,
      newValue: { count: milestones.length },
    });

    return { success: true };
  }

  /**
   * Orchestrates AI Arbitrator Analysis
   */
  public async analyzeEscrowContract(
    userId: number,
    escrowId: number
  ): Promise<{ success: boolean; analysisId: number }> {
    const escrow = await this.escrowRepository.getById(escrowId);
    if (!escrow) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Escrow not found" });
    }

    // Domain logic: Security/Business rule check
    if (!SmartEscrowDomainService.canRequestAiAnalysis(escrow, userId)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized" });
    }

    // Infrastructure: AI Analysis
    const analysis = await this.aiArbitratorService.analyze(escrow);

    // Infrastructure: Save analysis
    const newAnalysis = await this.escrowRepository.saveAiAnalysis(escrowId, analysis);

    // Infrastructure: Audit log
    await this.auditLogRepository.create({
      userId,
      action: "ai_arbitrator_analysis_completed",
      entityType: "escrow",
      entityId: escrowId,
      newValue: { analysisId: newAnalysis.id, score: analysis.fairnessScore },
    });

    return { success: true, analysisId: newAnalysis.id };
  }
}
