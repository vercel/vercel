export function extractBearerToken(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

export async function verifyOidc() {
  throw new Error('The eve test shim cannot verify OIDC tokens.');
}

export function vercelOidc() {
  return () => null;
}
