/**
 * Result shapes returned by CLI gateways.
 *
 * Parity convention: when a live gateway catches a thrown error (`APIError`,
 * network errno error, fs error), it stores the original error in
 * `error.details.cause` and sets `code` to a semantic value. Domain logic
 * rethrows `details.cause` wherever the legacy code would have let the error
 * propagate, so error rendering stays identical.
 */
export type GatewayErrorInfo = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type GatewayResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: GatewayErrorInfo };

export type OptionalResult<T> =
  | { type: 'found'; value: T }
  | { type: 'missing' }
  | { type: 'error'; error: GatewayErrorInfo };

export type OperationResult =
  | { ok: true }
  | { ok: false; error: GatewayErrorInfo };

/**
 * Builds a `GatewayErrorInfo` from a caught error, preserving the original
 * error object as `details.cause`.
 */
export function gatewayErrorFromCause(
  code: string,
  cause: unknown,
  details: Record<string, unknown> = {}
): GatewayErrorInfo {
  return {
    code,
    message: cause instanceof Error ? cause.message : String(cause),
    details: { ...details, cause },
  };
}

/**
 * Returns the original error behind a gateway failure, or a new `Error`
 * carrying the gateway message when no original error exists (fakes).
 */
export function gatewayErrorCause(error: GatewayErrorInfo): unknown {
  const cause = error.details?.cause;
  if (cause !== undefined) {
    return cause;
  }
  return Object.assign(new Error(error.message), { code: error.code });
}
