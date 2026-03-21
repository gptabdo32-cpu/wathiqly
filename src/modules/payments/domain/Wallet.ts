import { Decimal } from "decimal.js";

export interface WalletProps {
  id: number;
  userId: number;
  balance: string;
  currency: string;
  status: "active" | "frozen" | "closed";
}

export class Wallet {
  private constructor(private props: WalletProps) {}

  public static fromPersistence(props: WalletProps): Wallet {
    return new Wallet(props);
  }

  public getProps(): WalletProps {
    return { ...this.props };
  }

  public hasSufficientFunds(amount: string): boolean {
    return new Decimal(this.props.balance).gte(new Decimal(amount));
  }

  public debit(amount: string): string {
    if (!this.hasSufficientFunds(amount)) {
      throw new Error("Insufficient funds");
    }
    const previousBalance = this.props.balance;
    this.props.balance = new Decimal(this.props.balance).minus(new Decimal(amount)).toFixed(2);
    return previousBalance;
  }

  public credit(amount: string): string {
    const previousBalance = this.props.balance;
    this.props.balance = new Decimal(this.props.balance).plus(new Decimal(amount)).toFixed(2);
    return previousBalance;
  }
}
