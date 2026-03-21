import { Escrow, EscrowProps } from "../domain/Escrow";

/**
 * Escrow Infrastructure Mapper
 * Handles mapping between Domain and Persistence.
 * This is the only place allowed to use 'any' casting for domain reconstruction.
 */
export class EscrowMapper {
  public static toDomain(raw: any): Escrow {
    const props: EscrowProps = {
      id: raw.id,
      buyerId: raw.buyerId,
      sellerId: raw.sellerId,
      amount: raw.amount,
      description: raw.description,
      status: (raw.status as string).toUpperCase() as any,
      buyerLedgerAccountId: raw.buyerLedgerAccountId,
      escrowLedgerAccountId: raw.escrowLedgerAccountId,
      blockchainStatus: raw.blockchainStatus,
    };
    
    // Reconstruction via casting - bypassing private constructor for infrastructure only
    return new (Escrow as any)(props);
  }

  public static toPersistence(escrow: Escrow): any {
    // Accessing domain properties via getters
    return {
      id: escrow.id,
      buyerId: escrow.buyerId,
      sellerId: escrow.sellerId,
      amount: escrow.amount,
      description: escrow.description,
      status: escrow.status,
      buyerLedgerAccountId: escrow.buyerLedgerAccountId,
      escrowLedgerAccountId: escrow.escrowLedgerAccountId,
      blockchainStatus: escrow.blockchainStatus,
    };
  }
}
