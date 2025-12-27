export class VaultError extends Error {
  cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'VaultError';
    this.cause = cause;
  }

  toString(): string {
    if (this.cause) {
      return `${this.name}: ${this.message}: ${this.cause}`;
    }
    return `${this.name}: ${this.message}`;
  }
}

export class VaultTokenError extends VaultError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'VaultTokenError';
  }
}

export class VaultApiError extends VaultError {
  code: string;
  statusCode?: number;
  details?: unknown;

  constructor(
    message: string,
    code: string,
    statusCode?: number,
    details?: unknown,
    cause?: unknown
  ) {
    super(message, cause);
    this.name = 'VaultApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class VaultNotFoundError extends VaultApiError {
  constructor(secretPath: string) {
    super(`Secret not found: ${secretPath}`, 'not_found', 404);
    this.name = 'VaultNotFoundError';
  }
}

export class VaultAuthError extends VaultApiError {
  constructor(message: string, cause?: unknown) {
    super(message, 'auth_error', 401, undefined, cause);
    this.name = 'VaultAuthError';
  }
}
