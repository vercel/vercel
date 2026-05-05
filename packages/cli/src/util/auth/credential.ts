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
  const tokenParts = token.split('.');
  if (tokenParts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedBody] = tokenParts;
  if (!encodedHeader || !encodedBody) {
    return null;
  }

  try {
    const header: unknown = JSON.parse(
      Buffer.from(encodedHeader, 'base64url').toString('utf8')
    );
    const body: unknown = JSON.parse(
      Buffer.from(encodedBody, 'base64url').toString('utf8')
    );

    if (
      header &&
      typeof header === 'object' &&
      !Array.isArray(header) &&
      body &&
      typeof body === 'object' &&
      !Array.isArray(body)
    ) {
      return {
        header: header as Record<string, unknown>,
        payload: body as JwtPayload,
      };
    }
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
