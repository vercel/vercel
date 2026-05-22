import {
  createRemoteJWKSet,
  jwtVerify,
  decodeJwt,
  type JWTVerifyGetKey,
  type JWTPayload,
} from 'jose';

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
export interface VercelOidcTokenClaims extends JWTPayload {
  /** Issuer. `https://oidc.vercel.com` (global) or `https://oidc.vercel.com/[TEAM_SLUG]` (team). */
  iss?: string;
  /** Audience. `https://vercel.com/[TEAM_SLUG]`. */
  aud?: string | string[];
  /** Subject. `owner:[TEAM_SLUG]:project:[PROJECT_NAME]:environment:[ENVIRONMENT]`. */
  sub?: string;
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
 * The signature of a function used to fetch the JSON Web Key Set for a given
 * issuer. Useful for testing or when you want to provide your own caching layer.
 *
 * @internal
 */
export type JwksResolver = (issuer: string) => JWTVerifyGetKey;

const defaultJwksCache = new Map<string, JWTVerifyGetKey>();

const defaultJwksResolver: JwksResolver = issuer => {
  let jwks = defaultJwksCache.get(issuer);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks`));
    defaultJwksCache.set(issuer, jwks);
  }
  return jwks;
};

/**
 * @internal
 */
export interface ValidateVercelOidcTokenOptions {
  /**
   * Function used to resolve the JWKS for a given issuer. Defaults to a
   * function that fetches the JWKS from `${issuer}/.well-known/jwks`.
   *
   * Mainly useful for testing.
   *
   * @internal
   */
  jwks?: JwksResolver;
}

function isVercelIssuer(iss: string | undefined): iss is string {
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

/**
 * Verifies the signature, expiration, and standard claims of a Vercel OIDC
 * token, then matches its claims against the provided matchers.
 *
 * @internal
 */
async function verifyAndMatch(
  matchers: VercelOidcTokenMatcher | ReadonlyArray<VercelOidcTokenMatcher>,
  token: string,
  options?: ValidateVercelOidcTokenOptions
): Promise<
  | { ok: true; claims: VercelOidcTokenClaims }
  | { ok: false; reason: string; cause?: unknown }
> {
  if (typeof token !== 'string' || token.length === 0) {
    return { ok: false, reason: 'Token must be a non-empty string' };
  }

  const normalized = normalizeMatchers(matchers);
  if (normalized.length === 0) {
    return { ok: false, reason: 'At least one matcher is required' };
  }

  let unverifiedClaims: VercelOidcTokenClaims;
  try {
    unverifiedClaims = decodeJwt(token) as VercelOidcTokenClaims;
  } catch (error) {
    return { ok: false, reason: 'Token is not a valid JWT', cause: error };
  }

  if (!isVercelIssuer(unverifiedClaims.iss)) {
    return {
      ok: false,
      reason: `Token issuer "${unverifiedClaims.iss}" is not a valid Vercel OIDC issuer`,
    };
  }

  const issuer = unverifiedClaims.iss;
  const jwks = (options?.jwks ?? defaultJwksResolver)(issuer);

  let verified: VercelOidcTokenClaims;
  try {
    const result = await jwtVerify(token, jwks, {
      issuer,
      algorithms: ['RS256'],
    });
    verified = result.payload as VercelOidcTokenClaims;
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error
          ? `Token signature or claims could not be verified: ${error.message}`
          : 'Token signature or claims could not be verified',
      cause: error,
    };
  }

  for (const matcher of normalized) {
    if (matcherMatches(matcher, verified)) {
      return { ok: true, claims: verified };
    }
  }

  return {
    ok: false,
    reason:
      'Token claims did not match any of the provided matchers. ' +
      `Matched against claims: ${JSON.stringify({
        iss: verified.iss,
        aud: verified.aud,
        sub: verified.sub,
        owner: verified.owner,
        owner_id: verified.owner_id,
        project: verified.project,
        project_id: verified.project_id,
        environment: verified.environment,
        user_id: verified.user_id,
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
