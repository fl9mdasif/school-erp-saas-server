export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'DUPLICATE'
  | 'RATE_LIMITED'
  | 'PLAN_LIMIT_REACHED'
  | 'TENANT_SUSPENDED'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_LOCKED'
  | 'SLUG_INVALID'
  | 'SLUG_RESERVED'
  | 'SLUG_TAKEN'
  | 'BAD_REQUEST'
  | 'RESULT_NOT_FOUND'
  | 'INTERNAL_ERROR'
  | (string & {});

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static badRequest(message: string, details?: unknown, code: ErrorCode = 'BAD_REQUEST') {
    return new AppError(400, code, message, details);
  }
  static unauthorized(message = 'Authentication required', code: ErrorCode = 'UNAUTHORIZED') {
    return new AppError(401, code, message);
  }
  static forbidden(message = 'You do not have access to this resource', code: ErrorCode = 'FORBIDDEN') {
    return new AppError(403, code, message);
  }
  static notFound(message = 'Resource not found', code: ErrorCode = 'NOT_FOUND') {
    return new AppError(404, code, message);
  }
  static conflict(message: string, code: ErrorCode = 'CONFLICT', details?: unknown) {
    return new AppError(409, code, message, details);
  }
}
