import { createPayment, completePayment, failPayment, Payment, PaymentMethod } from "../domain/payment";
import { IPaymentRepo, IPaymentProvider, IEventBus, ITransactionManager } from "./interfaces";
import { PaymentProviderError } from "../domain/errors";

export interface ProcessPaymentInput {
  escrowId: string;
  amount: number;
  method: PaymentMethod;
}

export class ProcessPaymentUseCase {
  constructor(
    private paymentRepo: IPaymentRepo,
    private paymentProvider: IPaymentProvider,
    private eventBus: IEventBus,
    private transactionManager: ITransactionManager
  ) {}

  async execute(input: ProcessPaymentInput): Promise<Payment> {
    // 1. Domain Logic: Create and validate payment
    const payment = createPayment(input);

    // 2. Application Logic: Orchestrate with Transaction Management
    return await this.transactionManager.runInTransaction(async (trx) => {
      // Save initial pending payment
      const savedPayment = await this.paymentRepo.save(payment, trx);

      // 3. Infrastructure: Call External Provider
      const providerResult = await this.paymentProvider.charge(savedPayment.totalAmount, savedPayment.method);

      if (!providerResult.success) {
        const failedPayment = failPayment(savedPayment);
        await this.paymentRepo.updateStatus(savedPayment.id!, 'failed', providerResult.error);
        await this.eventBus.emit("PAYMENT_FAILED", { paymentId: savedPayment.id, error: providerResult.error });
        throw new PaymentProviderError("Stripe/Provider", providerResult.error || "Unknown error");
      }

      // 4. Domain Logic: Complete payment state
      const completedPayment = completePayment(savedPayment, providerResult.reference);

      // 5. Infrastructure: Update DB
      await this.paymentRepo.updateStatus(savedPayment.id!, 'completed', providerResult.reference);

      // 6. Application Logic: Emit Success Event
      await this.eventBus.emit("PAYMENT_COMPLETED", completedPayment);

      return completedPayment;
    });
  }
}
