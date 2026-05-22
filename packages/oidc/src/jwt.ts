/**
 * Minimal JWT + JWKS helpers used by {@link ./validate.ts}.
 *
 * This module is intentionally generic: it knows nothing about Vercel-specific
 * issuers, claims, or matchers. It only deals in JWTs and JSON Web Key Sets.
 *
 * It uses the platform `SubtleCrypto` and `fetch` APIs, both of which are
 * global in Node 20+ and in browsers, so this module has no runtime
 * dependencies.
 */

/** Default time-to-live for cached JWKS responses. */
const JWKS_DEFAULT_TTL_MS = 10 * 60 * 1000;

/** Minimum delay between forced JWKS refreshes when an unknown `kid` is encountered. */
const JWKS_MIN_REFRESH_INTERVAL_MS = 30 * 1000;

/**
 * A JSON Web Key.
 *
 * Only the fields used during signature verification are listed here; other
 * fields described by RFC 7517 are accepted but ignored.
 */
export interface PublicJsonWebKey {
  kty: string;
  kid?: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
  [key: string]: unknown;
}

/** A JSON Web Key Set as returned by `${issuer}/.well-known/jwks`. */
export interface Jwks {
  keys: PublicJsonWebKey[];
}

/**
 * A function that fetches the JSON Web Key Set for a given issuer. Useful for
 * tests and for applications that want to provide their own caching, retry, or
 * proxying layer.
 */
export type JwksFetcher = (issuer: string) => Promise<Jwks>;

/** A decoded but as-yet-unverified JWT. */
export interface DecodedJwt {
  header: { alg?: unknown; kid?: unknown; typ?: unknown };
  payload: Record<string, unknown>;
  signature: Uint8Array;
  /** The signed input (`${header}.${payload}` as UTF-8 bytes). */
  signedData: Uint8Array;
}

interface JwksCacheEntry {
  jwks: Jwks;
  fetchedAt: number;
  refreshedAt: number;
}

const jwksCache = new Map<string, JwksCacheEntry>();

/**
 * The default JWKS fetcher. Fetches `${issuer}/.well-known/jwks` and validates
 * the response shape.
 */
export const defaultFetchJwks: JwksFetcher = async issuer => {
  const url = `${issuer}/.well-known/jwks`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch JWKS from ${url}: HTTP ${res.status}`);
  }
  const json = (await res.json()) as unknown;
  if (
    !json ||
    typeof json !== 'object' ||
    !Array.isArray((json as Jwks).keys)
  ) {
    throw new Error(`Invalid JWKS response from ${url}`);
  }
  return json as Jwks;
};

async function loadJwks(
  issuer: string,
  fetchJwks: JwksFetcher,
  options: { force?: boolean } = {}
): Promise<Jwks> {
  const cached = jwksCache.get(issuer);
  const now = Date.now();
  if (
    cached &&
    !options.force &&
    now - cached.fetchedAt < JWKS_DEFAULT_TTL_MS
  ) {
    return cached.jwks;
  }
  if (
    cached &&
    options.force &&
    now - cached.refreshedAt < JWKS_MIN_REFRESH_INTERVAL_MS
  ) {
    return cached.jwks;
  }
  const jwks = await fetchJwks(issuer);
  const fetchedAt = Date.now();
  // Only update `refreshedAt` when this fetch was a forced refresh, so the
  // rate-limit window only restricts back-to-back forced refreshes (and not
  // a forced refresh that happens right after the initial unforced fetch).
  const refreshedAt = options.force ? fetchedAt : (cached?.refreshedAt ?? 0);
  jwksCache.set(issuer, { jwks, fetchedAt, refreshedAt });
  return jwks;
}

/**
 * Returns the JWK matching the given `kid` from the issuer's JWKS, or `null`
 * if no such key exists. If the cached JWKS does not contain the requested
 * `kid`, a single rate-limited refresh is attempted in case keys have rotated.
 */
export async function findJwksKey(
  issuer: string,
  kid: string,
  fetchJwks: JwksFetcher = defaultFetchJwks
): Promise<PublicJsonWebKey | null> {
  let jwks = await loadJwks(issuer, fetchJwks);
  let key = jwks.keys.find(k => k.kid === kid);
  if (key) return key;
  jwks = await loadJwks(issuer, fetchJwks, { force: true });
  key = jwks.keys.find(k => k.kid === kid);
  return key ?? null;
}

/** @internal Used by tests to reset the per-issuer JWKS cache. */
export function _resetJwksCacheForTesting(): void {
  jwksCache.clear();
}

function getSubtle(): SubtleCrypto {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto
    ?.subtle;
  if (!subtle) {
    throw new Error(
      'WebCrypto SubtleCrypto API is not available in this environment'
    );
  }
  return subtle;
}

function base64UrlDecode(input: string): Uint8Array {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=');
  if (typeof atob === 'function') {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  return new Uint8Array(
    (
      globalThis as { Buffer?: { from(s: string, e: string): Uint8Array } }
    ).Buffer!.from(padded, 'base64')
  );
}

function utf8Decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function utf8Encode(input: string): Uint8Array {
  return new TextEncoder().encode(input);
}

/**
 * Splits a JWT into its three parts and decodes the header and payload as
 * JSON. Does **not** verify the signature.
 *
 * @throws {Error} If the input is not a syntactically valid JWT.
 */
export function decodeJwt(token: string): DecodedJwt {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('JWT must contain exactly three dot-separated segments');
  }
  const [headerB64, payloadB64, signatureB64] = parts;
  let header: unknown;
  let payload: unknown;
  try {
    header = JSON.parse(utf8Decode(base64UrlDecode(headerB64)));
    payload = JSON.parse(utf8Decode(base64UrlDecode(payloadB64)));
  } catch (error) {
    const wrapped = new Error(
      'JWT header or payload is not valid base64url JSON'
    );
    (wrapped as { cause?: unknown }).cause = error;
    throw wrapped;
  }
  if (!header || typeof header !== 'object') {
    throw new Error('JWT header is not an object');
  }
  if (!payload || typeof payload !== 'object') {
    throw new Error('JWT payload is not an object');
  }
  return {
    header: header as DecodedJwt['header'],
    payload: payload as Record<string, unknown>,
    signature: base64UrlDecode(signatureB64),
    signedData: utf8Encode(`${headerB64}.${payloadB64}`),
  };
}

/**
 * Verifies an `RS256` signature using a JSON Web Key.
 *
 * @throws {Error} If the JWK's `kty` is not `RSA` or its `alg` is not `RS256`.
 */
export async function verifyRs256Signature(
  jwk: PublicJsonWebKey,
  signedData: Uint8Array,
  signature: Uint8Array
): Promise<boolean> {
  if (jwk.kty !== 'RSA') {
    throw new Error(`Unsupported JWK key type "${jwk.kty}"; expected "RSA"`);
  }
  if (jwk.alg !== undefined && jwk.alg !== 'RS256') {
    throw new Error(`Unsupported JWK algorithm "${jwk.alg}"; expected "RS256"`);
  }
  const subtle = getSubtle();
  const algorithm = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
  const cryptoKey = await subtle.importKey(
    'jwk',
    { ...jwk, alg: 'RS256', ext: true },
    algorithm,
    false,
    ['verify']
  );
  return subtle.verify(
    algorithm.name,
    cryptoKey,
    signature as BufferSource,
    signedData as BufferSource
  );
}
