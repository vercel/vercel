import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyOptions,
  type JWTVerifyResult,
  type JWTPayload,
} from 'jose';

const VERCEL_OIDC_ISSUER = 'https://oidc.vercel.com';
const VERCEL_OIDC_JWKS_URL = new URL(
  'https://oidc.vercel.com/.well-known/jwks'
);
const DEFAULT_ALGORITHMS = ['RS256'];
const VERCEL_OIDC_JWKS = createRemoteJWKSet(VERCEL_OIDC_JWKS_URL);

export type VercelOidcPayload = JWTPayload & {
  owner_id: string;
  project_id: string;
  environment: string;
  external_sub?: string;
  sub: string;
  aud: string;
  iss: string;
};

/**
 * Verifies a Vercel OIDC token against Vercel's remote JWKS.
 *
 * The issuer must be `https://oidc.vercel.com` or start with
 * `https://oidc.vercel.com/`. The JWKS is always
 * `https://oidc.vercel.com/.well-known/jwks`.
 *
 * Options:
 *
 * - `issuer`: Expected `iss` claim verified by Jose. The verified issuer must
 *   still be `https://oidc.vercel.com` or start with
 *   `https://oidc.vercel.com/`.
 * - `projectId`: Expected `project_id` claim or claims. Defaults to
 *   `process.env.VERCEL_PROJECT_ID`. Pass an array to allow any matching
 *   project ID. Pass `'*'` to allow any project ID. When `projectId` is `'*'`,
 *   either `ownerId` or `audience` is required.
 * - `environment`: Expected `environment` claim or claims. Defaults to
 *   `process.env.VERCEL_TARGET_ENV || process.env.VERCEL_ENV`. Pass an array
 *   to allow any matching environment. Pass `'*'` to allow any environment.
 * - `ownerId`: Expected `owner_id` claim. When omitted, the claim is not
 *   checked.
 * - Any other Jose JWT verification option.
 *
 * @param token The Vercel OIDC token to verify.
 * @param options Optional Jose JWT verification options.
 * @returns Jose's verified JWT result.
 */
export async function verifyVercelOidcToken<PayloadType = VercelOidcPayload>(
  token: string,
  options?: {
    projectId?: string | string[] | '*';
    environment?: string | string[] | '*';
    ownerId?: string;
  } & JWTVerifyOptions
): Promise<JWTVerifyResult<PayloadType>> {
  const {
    algorithms,
    projectId = process.env.VERCEL_PROJECT_ID,
    environment = process.env.VERCEL_TARGET_ENV || process.env.VERCEL_ENV,
    ownerId,
    ...verifyOptions
  } = options ?? {};

  if (
    projectId === '*' &&
    ownerId === undefined &&
    !hasAudienceVerification(verifyOptions.audience)
  ) {
    throw new TypeError(
      "Expected ownerId or audience to be provided when projectId is '*'."
    );
  }

  const result = await jwtVerify<PayloadType>(token, VERCEL_OIDC_JWKS, {
    ...verifyOptions,
    algorithms: algorithms ?? DEFAULT_ALGORITHMS,
  });

  validateIssuer(result.payload.iss);
  validateClaim({
    actual: result.payload.project_id,
    claim: 'project_id',
    env: 'VERCEL_PROJECT_ID',
    expected: projectId,
    option: 'projectId',
  });
  validateClaim({
    actual: result.payload.environment,
    claim: 'environment',
    env: 'VERCEL_TARGET_ENV or VERCEL_ENV',
    expected: environment,
    option: 'environment',
  });
  validateOptionalClaim({
    actual: result.payload.owner_id,
    claim: 'owner_id',
    expected: ownerId,
  });

  return result;
}

function hasAudienceVerification(
  audience: JWTVerifyOptions['audience']
): boolean {
  return Array.isArray(audience) ? audience.length > 0 : audience !== undefined;
}

function validateIssuer(actual: unknown): void {
  if (
    actual !== VERCEL_OIDC_ISSUER &&
    (typeof actual !== 'string' || !actual.startsWith(`${VERCEL_OIDC_ISSUER}/`))
  ) {
    throw new TypeError(
      `Expected Vercel OIDC token iss claim to be "${VERCEL_OIDC_ISSUER}" or to start with "${VERCEL_OIDC_ISSUER}/".`
    );
  }
}

function validateClaim({
  actual,
  claim,
  env,
  expected,
  option,
}: {
  actual: unknown;
  claim: string;
  env: string;
  expected: string | string[] | undefined;
  option: string;
}): void {
  if (expected === '*') {
    return;
  }

  if (expected === undefined || expected.length === 0) {
    throw new TypeError(
      `Expected ${env} to be set or ${option} to be provided. Pass ${option}: '*' to allow any ${claim} claim.`
    );
  }

  if (
    Array.isArray(expected) &&
    typeof actual === 'string' &&
    expected.includes(actual)
  ) {
    return;
  }

  if (actual !== expected) {
    throw new TypeError(
      Array.isArray(expected)
        ? `Expected Vercel OIDC token ${claim} claim to be one of: ${expected.map(value => `"${value}"`).join(', ')}.`
        : `Expected Vercel OIDC token ${claim} claim to be "${expected}".`
    );
  }
}

function validateOptionalClaim({
  actual,
  claim,
  expected,
}: {
  actual: unknown;
  claim: string;
  expected: string | undefined;
}): void {
  if (expected === undefined) {
    return;
  }

  if (actual !== expected) {
    throw new TypeError(
      `Expected Vercel OIDC token ${claim} claim to be "${expected}".`
    );
  }
}
