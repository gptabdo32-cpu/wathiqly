/**
 * Payment Domain Custom Errors
 * Professional error handling for production
 */

export class PaymentError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "PaymentError";
  }
}

export class InvalidPaymentAmountError extends PaymentError {
  constructor(amount: number) {
    super(`Invalid payment amount: ${amount}. Amount must be greater than 0.`, "INVALID_AMOUNT");
    this.code = "INVALID_AMOUNT";
  }
}

export class InsufficientFundsError extends PaymentError {
  constructor() {
    super("Insufficient funds in the wallet to complete this transaction.", "INSUFFICIENT_FUNDS");
    this.code = "INSUFFICIENT_FUNDS";
  }
}

export class PaymentProviderError extends PaymentError {
  constructor(provider: string, originalError: string) {
    super(`Payment provider ${provider} failed: ${originalError}`, "PROVIDER_FAILURE");
    this.code = "PROVIDER_FAILURE";
  }
}

export class InvalidPaymentStateError extends PaymentError {
  constructor(currentStatus: string, action: string) {
    super(`Cannot perform ${action} when payment is in ${currentStatus} status.`, "INVALID_STATE");
    this.code = "INVALID_STATE";
  }
}
