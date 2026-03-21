export type EscrowStatus = "PENDING" | "LOCKED" | "RELEASED" | "DISPUTED" | "REFUNDED" | "CANCELLED";

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

/**
 * Escrow Domain Entity
 * 100% Pure Domain: No persistence awareness, only business rules.
 */
export class Escrow {
  private constructor(private props: EscrowProps) {}

  public static create(props: Omit<EscrowProps, "status" | "blockchainStatus">): Escrow {
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
      status: "PENDING",
      blockchainStatus: "none",
    });
  }

  public canBeLocked(): boolean {
    return this.props.status === "PENDING";
  }

  public canBeReleased(): boolean {
    return this.props.status === "LOCKED";
  }

  public canBeDisputed(): boolean {
    return this.props.status === "LOCKED";
  }

  public lock(): void {
    if (!this.canBeLocked()) {
      throw new Error(`Cannot lock escrow in status: ${this.props.status}`);
    }
    this.props.status = "LOCKED";
  }

  public release(): void {
    if (!this.canBeReleased()) {
      throw new Error(`Cannot release escrow in status: ${this.props.status}`);
    }
    this.props.status = "RELEASED";
  }

  public dispute(): void {
    if (!this.canBeDisputed()) {
      throw new Error(`Cannot dispute escrow in status: ${this.props.status}`);
    }
    this.props.status = "DISPUTED";
  }

  public refund(): void {
    if (this.props.status !== "DISPUTED") {
      throw new Error(`Cannot refund escrow in status: ${this.props.status}`);
    }
    this.props.status = "REFUNDED";
  }

  public setBlockchainStatus(status: "none" | "pending" | "confirmed" | "failed"): void {
    this.props.blockchainStatus = status;
  }

  public updateLedgerAccounts(escrowLedgerId: number, buyerLedgerId?: number): void {
    this.props.escrowLedgerAccountId = escrowLedgerId;
    if (buyerLedgerId) {
      this.props.buyerLedgerAccountId = buyerLedgerId;
    }
  }

  // Domain state accessors (readonly)
  public get id() { return this.props.id; }
  public get buyerId() { return this.props.buyerId; }
  public get sellerId() { return this.props.sellerId; }
  public get amount() { return this.props.amount; }
  public get description() { return this.props.description; }
  public get status() { return this.props.status; }
  public get blockchainStatus() { return this.props.blockchainStatus; }
  public get escrowLedgerAccountId() { return this.props.escrowLedgerAccountId; }
  public get buyerLedgerAccountId() { return this.props.buyerLedgerAccountId; }
}
