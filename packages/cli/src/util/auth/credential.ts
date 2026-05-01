export interface JwtPayload {
  iss?: unknown;
  sub?: unknown;
  aud?: unknown;
  exp?: unknown;
}

interface DecodedJwt {
  header: Record<string, unknown>;
  body: JwtPayload;
}

export function isOidcJwtLike(token: string): boolean {
  const { header, body } = maybeDecodeJwt(token) ?? {};

  return (
    typeof header?.alg === 'string' &&
    typeof body?.iss === 'string' &&
    typeof body.sub === 'string' &&
    hasAudience(body.aud) &&
    typeof body.exp === 'number'
  );
}

export function getJwtPayload(token: string): JwtPayload | null {
  return maybeDecodeJwt(token)?.body ?? null;
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
        body: body as JwtPayload,
      };
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
