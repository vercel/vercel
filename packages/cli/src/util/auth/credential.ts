export type CredentialKind = 'vercel-token' | 'oidc-token' | 'invalid';

const VERCEL_TOKEN_PREFIXES = [
  'vca_',
  'vci_',
  'vck_',
  'vcp_',
  'vcr_',
  'vcs_',
  'vct_',
];

export function classifyCredential(token: string): CredentialKind {
  if (isOidcJwtLike(token)) {
    return 'oidc-token';
  }

  if (isVercelTokenLike(token)) {
    return 'vercel-token';
  }

  return 'invalid';
}

export function isVercelTokenLike(token: string): boolean {
  return VERCEL_TOKEN_PREFIXES.some(prefix => token.startsWith(prefix));
}

export function isOidcJwtLike(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some(part => part.length === 0)) {
    return false;
  }

  const payload = decodeJwtPayload(parts[1]);
  return (
    typeof payload?.iss === 'string' &&
    typeof payload.sub === 'string' &&
    hasAudience(payload.aud) &&
    typeof payload.exp === 'number' &&
    tokenHeaderIdentifiesJwt(parts[0])
  );
}

function hasAudience(aud: unknown): boolean {
  return (
    typeof aud === 'string' ||
    (Array.isArray(aud) && aud.every(value => typeof value === 'string'))
  );
}

function tokenHeaderIdentifiesJwt(segment: string): boolean {
  const header = decodeJwtPayload(segment);
  return typeof header?.alg === 'string';
}

function decodeJwtPayload(segment: string): Record<string, unknown> | null {
  try {
    const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      '='
    );
    const decoded = Buffer.from(padded, 'base64').toString('utf8');
    const payload: unknown = JSON.parse(decoded);
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      return payload as Record<string, unknown>;
    }
  } catch {}

  return null;
}
