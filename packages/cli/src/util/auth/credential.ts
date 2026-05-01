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

export interface JwtPayload {
  iss?: unknown;
  sub?: unknown;
  aud?: unknown;
  exp?: unknown;
}

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
  const header = getJwtHeader(token);
  const payload = getJwtPayload(token);

  return (
    typeof header?.alg === 'string' &&
    typeof payload?.iss === 'string' &&
    typeof payload.sub === 'string' &&
    hasAudience(payload.aud) &&
    typeof payload.exp === 'number'
  );
}

export function getJwtPayload(token: string): JwtPayload | null {
  return decodeJwtPart(token, 1);
}

function getJwtHeader(token: string): Record<string, unknown> | null {
  return decodeJwtPart(token, 0);
}

function decodeJwtPart(
  token: string,
  index: number
): Record<string, unknown> | null {
  const tokenParts = token.split('.');
  if (tokenParts.length !== 3) {
    return null;
  }

  const part = tokenParts[index];
  if (!part) {
    return null;
  }

  try {
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      '='
    );
    const decoded: unknown = JSON.parse(
      Buffer.from(padded, 'base64').toString('utf8')
    );

    if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) {
      return decoded as Record<string, unknown>;
    }
  } catch {}

  return null;
}

function hasAudience(aud: unknown): boolean {
  return (
    typeof aud === 'string' ||
    (Array.isArray(aud) && aud.every(value => typeof value === 'string'))
  );
}
