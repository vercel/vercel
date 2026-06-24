import { decodeJwt, decodeProtectedHeader } from 'jose';

/**
 * @internal Exported only for focused unit tests around OIDC token detection.
 */
export interface PartialOidcTokenPayload {
  iss?: unknown;
  sub?: unknown;
  aud?: unknown;
  exp?: unknown;
  iat?: unknown;
}

interface DecodedJwt {
  header: Record<string, unknown>;
  payload: PartialOidcTokenPayload;
}

interface SubjectTokenClaims {
  iss: string;
  sub: string | undefined;
  aud: unknown;
  exp: unknown;
  iat: unknown;
}

export function isOidcTokenLike(token: string): boolean {
  const decodedJwt = maybeDecodeJwt(token);
  const claims = decodeSubjectTokenClaims(token);

  return (
    typeof decodedJwt?.header.alg === 'string' &&
    typeof claims?.iss === 'string' &&
    typeof claims?.sub === 'string' &&
    hasAudience(claims.aud) &&
    typeof claims.exp === 'number' &&
    typeof claims.iat === 'number'
  );
}

/**
 * @internal Exported only for focused unit tests around OIDC token detection.
 */
export function getJwtPayload(token: string): PartialOidcTokenPayload | null {
  return maybeDecodeJwt(token)?.payload ?? null;
}

function maybeDecodeJwt(token: string): DecodedJwt | null {
  try {
    return {
      header: decodeProtectedHeader(token) as Record<string, unknown>,
      payload: decodeJwt(token) as PartialOidcTokenPayload,
    };
  } catch {}

  return null;
}

function decodeSubjectTokenClaims(token: string): SubjectTokenClaims | null {
  const payload = getJwtPayload(token);

  if (typeof payload?.iss !== 'string') {
    return null;
  }

  return {
    iss: payload.iss,
    sub: typeof payload.sub === 'string' ? payload.sub : undefined,
    aud: payload.aud,
    exp: payload.exp,
    iat: payload.iat,
  };
}

function hasAudience(aud: unknown): boolean {
  return (
    typeof aud === 'string' ||
    (Array.isArray(aud) && aud.every(value => typeof value === 'string'))
  );
}
