import { Wallet, WalletProps } from "../domain/Wallet";

/**
 * Wallet Infrastructure Mapper
 * Handles mapping between Domain and Persistence for Wallet entity.
 */
export class WalletMapper {
  public static toDomain(raw: any): Wallet {
    const props: WalletProps = {
      id: raw.id,
      userId: raw.userId,
      balance: raw.balance,
      currency: raw.currency || "USD",
      status: (raw.status as any) || "active",
    };
    
    // Reconstruction via casting - bypassing private constructor for infrastructure only
    return new (Wallet as any)(props);
  }

  public static toPersistence(wallet: Wallet): any {
    return {
      id: wallet.id,
      userId: wallet.userId,
      balance: wallet.balance,
      currency: wallet.currency,
      status: wallet.status,
    };
  }
}
