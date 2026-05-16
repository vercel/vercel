import { decodeJwt, decodeProtectedHeader } from 'jose';

export interface JwtPayload {
  iss?: unknown;
  sub?: unknown;
  aud?: unknown;
  exp?: unknown;
}

interface DecodedJwt {
  header: Record<string, unknown>;
  payload: JwtPayload;
}

interface SubjectTokenClaims {
  iss: string;
  sub: string | undefined;
  aud: unknown;
  exp: unknown;
}

export function isOidcJwtLike(token: string): boolean {
  const decodedJwt = maybeDecodeJwt(token);
  const claims = decodeSubjectTokenClaims(token);

  return (
    typeof decodedJwt?.header.alg === 'string' &&
    typeof claims?.sub === 'string' &&
    hasAudience(claims.aud) &&
    typeof claims.exp === 'number'
  );
}

export function getJwtPayload(token: string): JwtPayload | null {
  return maybeDecodeJwt(token)?.payload ?? null;
}

function maybeDecodeJwt(token: string): DecodedJwt | null {
  try {
    return {
      header: decodeProtectedHeader(token) as Record<string, unknown>,
      payload: decodeJwt(token) as JwtPayload,
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
  };
}

function hasAudience(aud: unknown): boolean {
  return (
    typeof aud === 'string' ||
    (Array.isArray(aud) && aud.every(value => typeof value === 'string'))
  );
}
