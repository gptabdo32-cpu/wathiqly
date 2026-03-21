import { Escrow, EscrowProps } from "../domain/Escrow";

export class EscrowMapper {
  public static toDomain(raw: any): Escrow {
    const props: EscrowProps = {
      id: raw.id,
      buyerId: raw.buyerId,
      sellerId: raw.sellerId,
      amount: raw.amount,
      description: raw.description,
      status: raw.status,
      buyerLedgerAccountId: raw.buyerLedgerAccountId,
      escrowLedgerAccountId: raw.escrowLedgerAccountId,
      blockchainStatus: raw.blockchainStatus,
    };
    return Escrow._createFromPersistence(props);
  }

  public static toPersistence(escrow: Escrow): any {
    const props = (escrow as any)._getInternalProps();
    return {
      id: props.id,
      buyerId: props.buyerId,
      sellerId: props.sellerId,
      amount: props.amount,
      description: props.description,
      status: props.status,
      buyerLedgerAccountId: props.buyerLedgerAccountId,
      escrowLedgerAccountId: props.escrowLedgerAccountId,
      blockchainStatus: props.blockchainStatus,
    };
  }
}
