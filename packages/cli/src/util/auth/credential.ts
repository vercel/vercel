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

const LEGACY_VERCEL_TOKEN_RE = /^[A-Za-z0-9]{24}$/;

export function classifyCredential(token: string): CredentialKind {
  if (isVercelTokenLike(token)) {
    return 'vercel-token';
  }

  if (isOidcJwtLike(token)) {
    return 'oidc-token';
  }

  return 'invalid';
}

export function isVercelTokenLike(token: string): boolean {
  return (
    LEGACY_VERCEL_TOKEN_RE.test(token) ||
    VERCEL_TOKEN_PREFIXES.some(prefix => token.startsWith(prefix))
  );
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
    typeof payload.exp === 'number'
  );
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
