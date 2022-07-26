import { isErrnoException } from '../is-error';

const knownErrorsCodes = new Set([
  'PAYMENT_REQUIRED',
  'BAD_REQUEST',
  'SYSTEM_ENV_WITH_VALUE',
  'RESERVED_ENV_VARIABLE',
  'ENV_ALREADY_EXISTS',
  'ENV_SHOULD_BE_A_SECRET',
]);

export function isKnownError(error: unknown) {
  const code = isErrnoException(error) ? error.code : null;
  if (!code) return false;
  return knownErrorsCodes.has(code.toUpperCase());
}
