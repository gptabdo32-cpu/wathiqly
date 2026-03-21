import { createEscrow, Escrow } from "../domain/escrow";
import { IEscrowRepo, IPaymentService, IEventBus } from "./interfaces";

export class CreateEscrowUseCase {
  constructor(
    private escrowRepo: IEscrowRepo,
    private paymentService: IPaymentService,
    private eventBus: IEventBus
  ) {}

  async execute(input: Partial<Escrow>): Promise<Escrow> {
    // 1. Use Domain Logic to create and validate
    const escrow = createEscrow(input);

    // 2. Save to Infrastructure (DB)
    const savedEscrow = await this.escrowRepo.save(escrow);

    // 3. Process Payment (External Service)
    if (savedEscrow.id) {
      await this.paymentService.processPayment(savedEscrow.id, savedEscrow.amount);
    }

    // 4. Emit Event
    await this.eventBus.emit("ESCROW_CREATED", savedEscrow);

    return savedEscrow;
  }
}
