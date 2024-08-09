import { isErrnoException } from '@vercel/error-utils';

const knownErrorsCodes = new Set([
  'BAD_REQUEST',
  'ENV_ALREADY_EXISTS',
  'ENV_CONFLICT',
  'ENV_SHOULD_BE_A_SECRET',
  'EXISTING_KEY_AND_TARGET',
  'FORBIDDEN',
  'ID_NOT_FOUND',
  'INVALID_KEY',
  'INVALID_VALUE',
  'KEY_INVALID_CHARACTERS',
  'KEY_INVALID_LENGTH',
  'KEY_RESERVED',
  'RESERVED_ENV_VARIABLE',
  'MAX_ENVS_EXCEEDED',
  'MISSING_ID',
  'MISSING_KEY',
  'MISSING_TARGET',
  'MISSING_VALUE',
  'NOT_AUTHORIZED',
  'NOT_DECRYPTABLE',
  'SECRET_MISSING',
  'SYSTEM_ENV_WITH_VALUE',
  'TEAM_NOT_FOUND',
  'TOO_MANY_IDS',
  'TOO_MANY_KEYS',
  'UNKNOWN_ERROR',
  'VALUE_INVALID_LENGTH',
  'VALUE_INVALID_TYPE',
]);

export function isKnownError(error: unknown) {
  const code = isErrnoException(error) ? error.code : null;
  if (!code) return false;
  return knownErrorsCodes.has(code.toUpperCase());
}
