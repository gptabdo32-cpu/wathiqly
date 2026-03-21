import { Decimal } from "decimal.js";

export interface WalletProps {
  id: number;
  userId: number;
  balance: string;
  currency: string;
  status: "active" | "frozen" | "closed";
}

/**
 * Wallet Domain Entity
 * 100% Pure Domain: No persistence awareness.
 */
export class Wallet {
  private constructor(private props: WalletProps) {}

  public hasSufficientFunds(amount: string): boolean {
    return new Decimal(this.props.balance).gte(new Decimal(amount));
  }

  public debit(amount: string): void {
    if (!this.hasSufficientFunds(amount)) {
      throw new Error("Insufficient funds");
    }
    this.props.balance = new Decimal(this.props.balance).minus(new Decimal(amount)).toFixed(2);
  }

  public credit(amount: string): void {
    this.props.balance = new Decimal(this.props.balance).plus(new Decimal(amount)).toFixed(2);
  }

  // Domain state accessors (readonly)
  public get id() { return this.props.id; }
  public get userId() { return this.props.userId; }
  public get balance() { return this.props.balance; }
  public get currency() { return this.props.currency; }
  public get status() { return this.props.status; }
}
