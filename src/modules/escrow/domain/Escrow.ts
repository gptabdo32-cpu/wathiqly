export type EscrowStatus = "pending" | "locked" | "released" | "disputed" | "refunded" | "cancelled";

export interface EscrowProps {
  id?: number;
  buyerId: number;
  sellerId: number;
  amount: string;
  description: string;
  status: EscrowStatus;
  buyerLedgerAccountId?: number;
  escrowLedgerAccountId?: number;
  blockchainStatus?: "none" | "pending" | "confirmed" | "failed";
}

export class Escrow {
  private constructor(private props: EscrowProps) {}

  public static create(props: Omit<EscrowProps, "status" | "blockchainStatus"> & { sellerWalletAddress?: string }): Escrow {
    // Business Rule: Amount validation
    const amountNum = parseFloat(props.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      throw new Error("Invalid escrow amount: must be a positive number");
    }

    // Business Rule: Description length
    if (props.description.length < 5) {
      throw new Error("Escrow description too short");
    }

    return new Escrow({
      ...props,
      status: "locked", // Initial status for new escrow
      blockchainStatus: "none",
    });
  }

  /**
   * Internal factory for infrastructure mapping.
   * This should only be used by Mappers in the Infrastructure layer.
   */
  public static _reconstitute(props: EscrowProps): Escrow {
    return new Escrow(props);
  }

  public getProps(): EscrowProps {
    return { ...this.props };
  }

  public canBeReleased(): boolean {
    return this.props.status === "locked";
  }

  public canBeDisputed(): boolean {
    return this.props.status === "locked";
  }

  public release(): void {
    if (!this.canBeReleased()) {
      throw new Error(`Cannot release escrow in status: ${this.props.status}`);
    }
    this.props.status = "released";
  }

  public dispute(): void {
    if (!this.canBeDisputed()) {
      throw new Error(`Cannot dispute escrow in status: ${this.props.status}`);
    }
    this.props.status = "disputed";
  }

  public refund(): void {
    if (this.props.status !== "disputed") {
      throw new Error(`Cannot refund escrow in status: ${this.props.status}`);
    }
    this.props.status = "refunded";
  }

  public setBlockchainStatus(status: "none" | "pending" | "confirmed" | "failed", txHash?: string): void {
    this.props.blockchainStatus = status;
  }
}
