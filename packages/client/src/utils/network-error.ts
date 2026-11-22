const retryableCodes = new Set([
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ENOTFOUND',
  'ECONNRESET',
  'EAI_FAIL',
  'EAI_AGAIN',
  'EPIPE',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET',
]);

type NetworkError = Error & {
  code?: string;
  cause?: unknown;
  errors?: unknown[];
};

export function isRetryableNetworkError(error: unknown, depth = 0): boolean {
  if (!(error instanceof Error) || depth > 5 || error.name === 'AbortError') {
    return false;
  }
  const err = error as NetworkError;
  if (err.code) return retryableCodes.has(err.code);
  if (Array.isArray(err.errors) && err.errors.length > 0) {
    return err.errors.every(child => isRetryableNetworkError(child, depth + 1));
  }
  if (err.cause) return isRetryableNetworkError(err.cause, depth + 1);
  return /ETIMEDOUT|ECONNREFUSED|ENOTFOUND|ECONNRESET|EAI_FAIL|socket hang up|network socket disconnected/.test(
    err.message
  );
}

// Only emit transport metadata. Messages and stacks may contain URLs or credentials.
export function formatNetworkError(error: unknown, depth = 0): string {
  if (!(error instanceof Error)) return 'Unknown error';
  if (depth > 5) return '[truncated]';
  const err = error as NetworkError;
  const fields: string[] = [];
  for (const value of [err.name, err.code]) {
    if (
      typeof value === 'string' &&
      /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(value)
    ) {
      fields.push(value);
    }
  }
  if (Array.isArray(err.errors)) {
    fields.push(
      `[${err.errors
        .slice(0, 5)
        .map(child => formatNetworkError(child, depth + 1))
        .join(', ')}]`
    );
  }
  if (err.cause)
    fields.push(`cause=(${formatNetworkError(err.cause, depth + 1)})`);
  return fields.join(' ') || 'Error';
}
