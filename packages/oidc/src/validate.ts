import {
  decodeJwt,
  defaultFetchJwks,
  findJwksKey,
  verifyRs256Signature,
  type DecodedJwt,
  type Jwks,
  type JwksFetcher,
  type PublicJsonWebKey,
} from './jwt';

/**
 * The base issuer URL for Vercel OIDC tokens.
 *
 * In team issuer mode, the actual issuer is `https://oidc.vercel.com/[TEAM_SLUG]`.
 */
const VERCEL_OIDC_ISSUER_BASE = 'https://oidc.vercel.com';

/**
 * Claims emitted in a Vercel OIDC token.
 *
 * @see https://vercel.com/docs/oidc/reference#oidc-token-anatomy
 */
export interface VercelOidcTokenClaims {
  /** Issuer. `https://oidc.vercel.com` (global) or `https://oidc.vercel.com/[TEAM_SLUG]` (team). */
  iss?: string;
  /** Audience. `https://vercel.com/[TEAM_SLUG]`. */
  aud?: string | string[];
  /** Subject. `owner:[TEAM_SLUG]:project:[PROJECT_NAME]:environment:[ENVIRONMENT]`. */
  sub?: string;
  /** Expiration time (seconds since epoch). */
  exp?: number;
  /** Not-before time (seconds since epoch). */
  nbf?: number;
  /** Issued-at time (seconds since epoch). */
  iat?: number;
  /** Team slug (e.g. `acme`). */
  owner?: string;
  /** Team ID (e.g. `team_7Gw5...`). */
  owner_id?: string;
  /** Project name (e.g. `acme_website`). */
  project?: string;
  /** Project ID (e.g. `prj_7Gw5...`). */
  project_id?: string;
  /** Environment: `production`, `preview`, or `development`. */
  environment?: string;
  /** User ID. Only present when environment is `development`. */
  user_id?: string;
  /** Other claims that may be present. */
  [claim: string]: unknown;
}

/**
 * A matcher used to validate the claims of a Vercel OIDC token.
 *
 * All non-`undefined` properties on a matcher must equal the corresponding claim
 * on the token for the matcher to be considered a match. A token is accepted if
 * it matches at least one of the provided matchers.
 *
 * Both friendly aliases (e.g. `team`, `teamId`, `projectId`, `userId`) and the
 * raw OIDC claim names (e.g. `owner`, `owner_id`, `project_id`, `user_id`) are
 * supported. When both are provided on the same matcher, both must match.
 */
export interface VercelOidcTokenMatcher {
  /** Matches the `iss` claim. */
  iss?: string;
  /** Matches the `aud` claim. */
  aud?: string;
  /** Matches the `sub` claim. */
  sub?: string;
  /** Matches the `owner` claim (the team slug). Alias for `owner`. */
  team?: string;
  /** Matches the `owner` claim (the team slug). */
  owner?: string;
  /** Matches the `owner_id` claim (the team ID). Alias for `owner_id`. */
  teamId?: string;
  /** Matches the `owner_id` claim (the team ID). */
  owner_id?: string;
  /** Matches the `project` claim (the project name). */
  project?: string;
  /** Matches the `project_id` claim (the project ID). Alias for `project_id`. */
  projectId?: string;
  /** Matches the `project_id` claim (the project ID). */
  project_id?: string;
  /** Matches the `environment` claim. */
  environment?: 'production' | 'preview' | 'development' | (string & {});
  /** Matches the `user_id` claim. Alias for `user_id`. */
  userId?: string;
  /** Matches the `user_id` claim. */
  user_id?: string;
}

/**
 * Thrown by {@link assertValidVercelOidcToken} when a token cannot be accepted.
 */
export class UnacceptableVercelOidcTokenError extends Error {
  cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'UnacceptableVercelOidcTokenError';
    this.cause = cause;
  }

  override toString() {
    if (this.cause) {
      return `${this.name}: ${this.message}: ${this.cause}`;
    }
    return `${this.name}: ${this.message}`;
  }
}

/**
 * Re-exported from `./jwt` for convenience.
 */
export type { Jwks, JwksFetcher };

/**
 * @internal
 */
export interface ValidateVercelOidcTokenOptions {
  /**
   * Function used to fetch the JWKS for a given issuer. Defaults to a function
   * that fetches `${issuer}/.well-known/jwks` and caches the response in memory.
   *
   * @internal
   */
  fetchJwks?: JwksFetcher;
}

function isVercelIssuer(iss: unknown): iss is string {
  if (typeof iss !== 'string') return false;
  if (iss === VERCEL_OIDC_ISSUER_BASE) return true;
  if (!iss.startsWith(`${VERCEL_OIDC_ISSUER_BASE}/`)) return false;
  // Make sure the path component looks like a team slug and not e.g. a path
  // traversal attack: `https://oidc.vercel.com/../evil.com`.
  const remainder = iss.slice(`${VERCEL_OIDC_ISSUER_BASE}/`.length);
  return /^[A-Za-z0-9_-]+$/.test(remainder);
}

const matcherClaimMap: ReadonlyArray<
  [keyof VercelOidcTokenMatcher, keyof VercelOidcTokenClaims]
> = [
  ['iss', 'iss'],
  ['aud', 'aud'],
  ['sub', 'sub'],
  ['team', 'owner'],
  ['owner', 'owner'],
  ['teamId', 'owner_id'],
  ['owner_id', 'owner_id'],
  ['project', 'project'],
  ['projectId', 'project_id'],
  ['project_id', 'project_id'],
  ['environment', 'environment'],
  ['userId', 'user_id'],
  ['user_id', 'user_id'],
];

function claimMatchesValue(claim: unknown, expected: string): boolean {
  if (typeof claim === 'string') {
    return claim === expected;
  }
  if (Array.isArray(claim)) {
    return claim.some(v => v === expected);
  }
  return false;
}

function matcherMatches(
  matcher: VercelOidcTokenMatcher,
  claims: VercelOidcTokenClaims
): boolean {
  for (const [matcherKey, claimKey] of matcherClaimMap) {
    const expected = matcher[matcherKey];
    if (expected === undefined) continue;
    if (!claimMatchesValue(claims[claimKey], expected)) {
      return false;
    }
  }
  return true;
}

function normalizeMatchers(
  matchers: VercelOidcTokenMatcher | ReadonlyArray<VercelOidcTokenMatcher>
): ReadonlyArray<VercelOidcTokenMatcher> {
  return Array.isArray(matchers)
    ? matchers
    : [matchers as VercelOidcTokenMatcher];
}

type VerificationResult =
  | { ok: true; claims: VercelOidcTokenClaims }
  | { ok: false; reason: string; cause?: unknown };

async function verifyAndMatch(
  matchers: VercelOidcTokenMatcher | ReadonlyArray<VercelOidcTokenMatcher>,
  token: string,
  options?: ValidateVercelOidcTokenOptions
): Promise<VerificationResult> {
  if (typeof token !== 'string' || token.length === 0) {
    return { ok: false, reason: 'Token must be a non-empty string' };
  }

  const normalized = normalizeMatchers(matchers);
  if (normalized.length === 0) {
    return { ok: false, reason: 'At least one matcher is required' };
  }

  let decoded: DecodedJwt;
  try {
    decoded = decodeJwt(token);
  } catch (error) {
    return { ok: false, reason: 'Token is not a valid JWT', cause: error };
  }

  const { header, payload, signature, signedData } = decoded;
  const claims = payload as VercelOidcTokenClaims;

  if (header.alg !== 'RS256') {
    return {
      ok: false,
      reason: `Unsupported JWT algorithm "${String(header.alg)}"; expected "RS256"`,
    };
  }
  if (typeof header.kid !== 'string' || header.kid.length === 0) {
    return { ok: false, reason: 'JWT header is missing a "kid" property' };
  }

  if (!isVercelIssuer(claims.iss)) {
    return {
      ok: false,
      reason: `Token issuer "${String(claims.iss)}" is not a valid Vercel OIDC issuer`,
    };
  }
  const issuer = claims.iss;
  const fetchJwks = options?.fetchJwks ?? defaultFetchJwks;

  let jwk: PublicJsonWebKey | null;
  try {
    jwk = await findJwksKey(issuer, header.kid, fetchJwks);
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error
          ? `Failed to load JWKS for ${issuer}: ${error.message}`
          : `Failed to load JWKS for ${issuer}`,
      cause: error,
    };
  }
  if (!jwk) {
    return {
      ok: false,
      reason: `No key matching kid "${header.kid}" was found in JWKS for ${issuer}`,
    };
  }

  let signatureValid: boolean;
  try {
    signatureValid = await verifyRs256Signature(jwk, signedData, signature);
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error
          ? `Token signature could not be verified: ${error.message}`
          : 'Token signature could not be verified',
      cause: error,
    };
  }
  if (!signatureValid) {
    return { ok: false, reason: 'Token signature is invalid' };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== 'number') {
    return { ok: false, reason: 'Token is missing an "exp" claim' };
  }
  if (claims.exp <= nowSeconds) {
    return { ok: false, reason: 'Token is expired' };
  }
  if (typeof claims.nbf === 'number' && claims.nbf > nowSeconds) {
    return {
      ok: false,
      reason: 'Token is not yet valid (nbf is in the future)',
    };
  }

  for (const matcher of normalized) {
    if (matcherMatches(matcher, claims)) {
      return { ok: true, claims };
    }
  }

  return {
    ok: false,
    reason:
      'Token claims did not match any of the provided matchers. ' +
      `Matched against claims: ${JSON.stringify({
        iss: claims.iss,
        aud: claims.aud,
        sub: claims.sub,
        owner: claims.owner,
        owner_id: claims.owner_id,
        project: claims.project,
        project_id: claims.project_id,
        environment: claims.environment,
        user_id: claims.user_id,
      })}`,
  };
}

/**
 * Returns `true` if the given Vercel OIDC token has a valid signature, has not
 * expired, and matches at least one of the provided matchers; otherwise
 * `false`.
 *
 * The token's signature is verified against the JSON Web Key Set served by the
 * issuer (either `https://oidc.vercel.com` or `https://oidc.vercel.com/[TEAM_SLUG]`).
 *
 * @example
 * ```ts
 * import { isValidVercelOidcToken } from '@vercel/oidc';
 *
 * const ok = await isValidVercelOidcToken(
 *   [
 *     { team: 'vercel', project: 'vercel-alerts', environment: 'production' },
 *     { team: 'vercel-labs', project: 'oidc-trigger', environment: 'preview' },
 *   ],
 *   token
 * );
 * ```
 */
export async function isValidVercelOidcToken(
  matchers: VercelOidcTokenMatcher | ReadonlyArray<VercelOidcTokenMatcher>,
  token: string,
  options?: ValidateVercelOidcTokenOptions
): Promise<boolean> {
  const result = await verifyAndMatch(matchers, token, options);
  return result.ok;
}

/**
 * Verifies the signature and claims of a Vercel OIDC token and asserts that it
 * matches at least one of the provided matchers. Throws
 * {@link UnacceptableVercelOidcTokenError} if the token cannot be verified or
 * does not match any of the matchers.
 *
 * @example
 * ```ts
 * import { assertValidVercelOidcToken } from '@vercel/oidc';
 *
 * await assertValidVercelOidcToken(
 *   [
 *     { team: 'vercel', project: 'vercel-alerts', environment: 'production' },
 *   ],
 *   token
 * );
 * ```
 *
 * @throws {UnacceptableVercelOidcTokenError} If the token is not valid.
 */
export async function assertValidVercelOidcToken(
  matchers: VercelOidcTokenMatcher | ReadonlyArray<VercelOidcTokenMatcher>,
  token: string,
  options?: ValidateVercelOidcTokenOptions
): Promise<void> {
  const result = await verifyAndMatch(matchers, token, options);
  if (!result.ok) {
    throw new UnacceptableVercelOidcTokenError(result.reason, result.cause);
  }
}
