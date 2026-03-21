import { Escrow } from "./Escrow";

export class EscrowDomainService {
  static validateEscrowAmount(amount: string): number {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      throw new Error("Invalid escrow amount");
    }
    return parsedAmount;
  }

  static canReleaseEscrow(escrow: Escrow): boolean {
    if (escrow.status !== "locked") {
      throw new Error(`Invalid Escrow transition: ${escrow.status} -> released`);
    }
    return true;
  }

  static canOpenDispute(escrow: Escrow): boolean {
    if (escrow.status !== "locked") {
      throw new Error(`Invalid Escrow transition: ${escrow.status} -> disputed`);
    }
    return true;
  }
}
