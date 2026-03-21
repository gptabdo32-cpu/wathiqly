/**
 * Base Application Error
 */
export abstract class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(message: string, code: string, statusCode: number = 500) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Domain-Specific Errors
 */
export class DomainValidationError extends AppError {
  constructor(message: string) {
    super(message, "DOMAIN_VALIDATION_ERROR", 400);
  }
}

export class ResourceNotFoundError extends AppError {
  constructor(resource: string, id: string | number) {
    super(`${resource} with ID ${id} not found`, "RESOURCE_NOT_FOUND", 404);
  }
}

export class InsufficientFundsError extends AppError {
  constructor() {
    super("Insufficient funds to complete the transaction", "INSUFFICIENT_FUNDS", 400);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = "Unauthorized access") {
    super(message, "UNAUTHORIZED", 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = "Access forbidden") {
    super(message, "FORBIDDEN", 403);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, "CONFLICT", 409);
  }
}

/**
 * Infrastructure Errors
 */
export class ExternalServiceError extends AppError {
  constructor(service: string, message: string) {
    super(`External service ${service} failed: ${message}`, "EXTERNAL_SERVICE_ERROR", 502);
  }
}
