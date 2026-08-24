import { createHmac } from 'node:crypto';

export const REDACTED = '[REDACTED]';

const TOKEN_RE = /^[a-z0-9][a-z0-9:-]{0,31}$/;
const FLAG_RE = /^--[a-z0-9-]{1,24}$/;
const SLUG_RE = /^[a-z0-9/._-]{1,64}$/;

const SLUG_PREFIXES = ['https://err.sh/', 'https://vercel.com/docs/'];

/**
 * Command-like tokens only (kebab-case, no paths or secrets).
 * Everything else is redacted.
 */
export function gatedToken(value: string): string {
  const token = value.toLowerCase();
  return TOKEN_RE.test(token) ? token : REDACTED;
}

/** Option names only (`--foo-bar`). Everything else is redacted. */
export function gatedFlag(value: string): string {
  return FLAG_RE.test(value) ? value : REDACTED;
}

/** Slugs from our own error/docs links. Everything else is redacted. */
export function slug(value: string): string {
  let s = value;
  for (const prefix of SLUG_PREFIXES) {
    if (s.startsWith(prefix)) {
      s = s.slice(prefix.length);
      break;
    }
  }
  return SLUG_RE.test(s) ? s : REDACTED;
}

function hmac(parts: readonly (string | number)[], salt: string): string {
  return createHmac('sha256', salt).update(parts.join('\u0000')).digest('hex');
}

/**
 * Salted fingerprint: stable per salt (device), irreversible off-device.
 * Used to correlate repeated invocations without revealing their contents.
 */
export function fp(values: readonly string[], salt: string): string {
  return hmac(values, salt).slice(0, 32);
}

/** Salted context hash for scoping sessions to a terminal/harness. */
export function ctxHash(
  parts: readonly (string | number)[],
  salt: string
): string {
  return hmac(parts, salt).slice(0, 16);
}
