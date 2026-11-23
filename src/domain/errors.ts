export type DomainErrorCode =
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "HISTORY_BLOCK"
  | "INVALID_TRANSITION"
  | "ALREADY_PROCESSED"
  | "INSUFFICIENT_BUDGET"
  | "BUREAU_REQUIRED"
  | "BUREAU_UNAVAILABLE"
  | "IDEMPOTENCY_CONFLICT"
  | "RATE_LIMITED";

const HTTP_STATUS: Record<DomainErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  HISTORY_BLOCK: 409,
  INVALID_TRANSITION: 409,
  ALREADY_PROCESSED: 409,
  INSUFFICIENT_BUDGET: 409,
  BUREAU_REQUIRED: 409,
  BUREAU_UNAVAILABLE: 503,
  IDEMPOTENCY_CONFLICT: 422,
  RATE_LIMITED: 429,
};

export class DomainError extends Error {
  readonly httpStatus: number;
  constructor(
    readonly code: DomainErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "DomainError";
    this.httpStatus = HTTP_STATUS[code];
  }
}
