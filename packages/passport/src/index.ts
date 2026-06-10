import { createRemoteJWKSet, jwtVerify, type JWTVerifyOptions } from 'jose';

export const PASSPORT_HEADER_NAME = 'x-vercel-oidc-passport-token';
export const PASSPORT_COOKIE_NAME = '_vercel_passport';

export type TokenSource = 'header' | 'cookie' | 'local';

export interface PassportIdentityPayload {
  typ?: string;
  owner?: string;
  owner_id?: string;
  project?: string;
  project_id?: string;
  environment?: string;
  plan?: string;
  aud?: string;
  iss?: string;
  sub: string;
  scope?: string;
  external_sub?: string;
  connector_id?: string;
  sid?: string;
  tenant_id?: string;
  installation_id?: string;
  email?: string;
  name?: string;
  [claim: string]: unknown;
}

export interface PassportIdentity {
  token: string | null;
  tokenSource: TokenSource;
  verified: boolean;
  payload: PassportIdentityPayload;
  subject: string;
  externalSubject?: string;
  connectorId?: string;
  owner?: string;
  project?: string;
  environment?: string;
}

export interface HeadersLike {
  get(name: string): string | null | undefined;
}

export interface RequestLike {
  headers: HeadersLike | HeaderRecord;
}

export type HeaderRecord = Record<string, string | string[] | undefined>;

export interface CookieLike {
  get(name: string): { value?: string } | string | null | undefined;
}

export interface PassportIdentityInput {
  headers?: HeadersLike | HeaderRecord;
  cookies?: CookieLike;
  cookieHeader?: string;
  token?: string;
}

const VERCEL_OIDC_ISSUER = 'https://oidc.vercel.com';
const PASSPORT_ISSUER = 'https://passport.vercel.com';
const VERCEL_OIDC_JWKS = createRemoteJWKSet(
  new URL(`${VERCEL_OIDC_ISSUER}/.well-known/jwks`)
);
const PASSPORT_JWKS = createRemoteJWKSet(
  new URL(`${PASSPORT_ISSUER}/.well-known/jwks`)
);
const DEFAULT_ALGORITHMS = ['RS256'];
const SYMBOL_FOR_REQ_CONTEXT = Symbol.for('@vercel/request-context');
let hasWarnedAboutDevelopmentIdentity = false;

type RequestContext = {
  headers?: Record<string, string>;
};

export interface PassportDevelopmentIdentityOptions {
  enabled?: boolean;
  connectorId?: string;
  environment?: string;
  externalSubject?: string;
  owner?: string;
  project?: string;
}

export interface PassportIdentityOptions {
  /**
   * Verify the Passport token against Vercel's JWKS before returning it.
   * Defaults to true for tokens read from headers or cookies.
   */
  verify?: boolean;
  /**
   * Allow a decoded but unverified token when verification is disabled.
   * Defaults to true when `verify` is false.
   */
  allowUnverified?: boolean;
  /**
   * Local development identity generation used when no Passport header/cookie
   * exists. Defaults to enabled outside production. Set to false to disable.
   * Ignored when `NODE_ENV=production`.
   */
  development?: boolean | PassportDevelopmentIdentityOptions;
  /**
   * Local development identity used when no Passport header/cookie exists.
   */
  localIdentity?: PassportIdentityPayload | string;
  /**
   * Environment variable name containing a JSON local development identity.
   * Defaults to `VERCEL_PASSPORT_IDENTITY`.
   */
  localIdentityEnv?: string;
  /**
   * Environment variable name containing a Passport JWT for local development.
   * Defaults to `VERCEL_PASSPORT_TOKEN`.
   */
  localTokenEnv?: string;
  /**
   * Options forwarded to the JWT verifier when verifying the token.
   */
  verifyOptions?: PassportVerifyOptions;
}

export class PassportIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PassportIdentityError';
  }
}

/**
 * Read the Passport identity for the current request.
 *
 * The helper reads Vercel's request context by default. It prefers the trusted
 * `x-vercel-oidc-passport-token` header, then falls back to the
 * `_vercel_passport` cookie. It accepts both the current Vercel OIDC issuer and
 * the dedicated Passport issuer, but always requires Passport-specific claims.
 * For local development, pass `localIdentity` or set `VERCEL_PASSPORT_IDENTITY`
 * to a JSON object.
 */
export async function getIdentity(
  input?: RequestLike | HeadersLike | HeaderRecord | PassportIdentityInput,
  options: PassportIdentityOptions = {}
): Promise<PassportIdentity | null> {
  const normalized = normalizeInput(input);
  const context = getContext();
  const headers = normalized.headers ?? context.headers;
  const tokenFromInput = normalized.token;
  const headerToken = getHeader(headers, PASSPORT_HEADER_NAME);
  const cookieToken = getCookie(
    normalized.cookies,
    normalized.cookieHeader ?? getHeader(headers, 'cookie'),
    PASSPORT_COOKIE_NAME
  );
  const token =
    tokenFromInput ?? headerToken ?? cookieToken ?? getEnvToken(options);
  const tokenSource: TokenSource = tokenFromInput
    ? 'local'
    : headerToken
      ? 'header'
      : cookieToken
        ? 'cookie'
        : 'local';

  if (token) {
    const verify = options.verify ?? tokenSource !== 'local';
    if (verify) {
      const payload = await verifyPassportToken(token, options.verifyOptions);
      return createIdentity(token, tokenSource, true, payload);
    }

    if (options.allowUnverified === false) {
      throw new PassportIdentityError(
        'Passport identity token verification is disabled and unverified tokens are not allowed.'
      );
    }

    return createIdentity(token, tokenSource, false, decodeJwtPayload(token));
  }

  const localIdentity = getLocalIdentity(options);
  if (localIdentity) {
    return createIdentity(null, 'local', false, localIdentity);
  }

  return null;
}

function createIdentity(
  token: string | null,
  tokenSource: TokenSource,
  verified: boolean,
  payload: PassportIdentityPayload
): PassportIdentity {
  validatePassportPayload(payload);

  return {
    token,
    tokenSource,
    verified,
    payload,
    subject: payload.sub,
    externalSubject: stringClaim(payload.external_sub),
    connectorId: stringClaim(payload.connector_id),
    owner: stringClaim(payload.owner),
    project: stringClaim(payload.project),
    environment: stringClaim(payload.environment),
  };
}

function normalizeInput(
  input?: RequestLike | HeadersLike | HeaderRecord | PassportIdentityInput
): PassportIdentityInput {
  if (!input) {
    return {};
  }

  if (isPassportIdentityInput(input)) {
    return input;
  }

  if (isRequestLike(input)) {
    return { headers: input.headers };
  }

  return { headers: input };
}

function isPassportIdentityInput(
  input: unknown
): input is PassportIdentityInput {
  if (!input || typeof input !== 'object') {
    return false;
  }

  return 'token' in input || 'cookies' in input || 'cookieHeader' in input;
}

function isRequestLike(input: unknown): input is RequestLike {
  if (!input || typeof input !== 'object' || !('headers' in input)) {
    return false;
  }

  return !isHeadersLike(input);
}

function isHeadersLike(input: unknown): input is HeadersLike {
  return Boolean(
    input &&
      typeof input === 'object' &&
      'get' in input &&
      typeof input.get === 'function'
  );
}

function getContext(): RequestContext {
  const fromSymbol: typeof globalThis & {
    [SYMBOL_FOR_REQ_CONTEXT]?: { get?: () => RequestContext };
  } = globalThis;
  return fromSymbol[SYMBOL_FOR_REQ_CONTEXT]?.get?.() ?? {};
}

function getHeader(
  headers: HeadersLike | HeaderRecord | undefined,
  name: string
): string | undefined {
  if (!headers) {
    return undefined;
  }

  if ('get' in headers && typeof headers.get === 'function') {
    return headers.get(name) ?? undefined;
  }

  const lowerName = name.toLowerCase();
  const value = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === lowerName
  )?.[1];

  return Array.isArray(value) ? value[0] : value;
}

function getCookie(
  cookies: CookieLike | undefined,
  cookieHeader: string | undefined,
  name: string
): string | undefined {
  if (cookies) {
    const value = cookies.get(name);
    if (typeof value === 'string') {
      return value;
    }
    if (value?.value) {
      return value.value;
    }
  }

  if (!cookieHeader) {
    return undefined;
  }

  for (const part of cookieHeader.split(';')) {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (rawKey === name) {
      return rawValue.join('=');
    }
  }

  return undefined;
}

function getEnvToken(options: PassportIdentityOptions): string | undefined {
  const envName = options.localTokenEnv ?? 'VERCEL_PASSPORT_TOKEN';
  return process.env[envName] || undefined;
}

function getLocalIdentity(
  options: PassportIdentityOptions
): PassportIdentityPayload | undefined {
  const localIdentity = options.localIdentity;
  if (typeof localIdentity === 'object') {
    return localIdentity;
  }
  if (typeof localIdentity === 'string' && localIdentity !== '') {
    return parseLocalIdentity(localIdentity);
  }

  const envName = options.localIdentityEnv ?? 'VERCEL_PASSPORT_IDENTITY';
  const envValue = process.env[envName];
  if (envValue) {
    return parseLocalIdentity(envValue);
  }

  return getDevelopmentIdentity(options);
}

function getDevelopmentIdentity(
  options: PassportIdentityOptions
): PassportIdentityPayload | undefined {
  if (process.env.NODE_ENV === 'production') {
    return undefined;
  }

  const development = options.development;
  const config = typeof development === 'object' ? development : {};
  const envEnabled = process.env.VERCEL_PASSPORT_DEV;
  const enabled =
    development !== false &&
    config.enabled !== false &&
    envEnabled !== '0' &&
    envEnabled !== 'false';

  if (!enabled) {
    return undefined;
  }

  const owner =
    config.owner ?? process.env.VERCEL_PASSPORT_DEV_OWNER ?? 'local';
  const connectorId =
    config.connectorId ??
    process.env.VERCEL_PASSPORT_DEV_CONNECTOR_ID ??
    'local';
  const externalSubject =
    config.externalSubject ??
    process.env.VERCEL_PASSPORT_DEV_EXTERNAL_SUB ??
    'test-user';
  const environment =
    config.environment ??
    process.env.VERCEL_PASSPORT_DEV_ENVIRONMENT ??
    'development';
  const project =
    config.project ?? process.env.VERCEL_PASSPORT_DEV_PROJECT ?? 'local';
  const subject = `owner:${owner}:connector:${connectorId}:principal:${externalSubject}`;

  warnAboutDevelopmentIdentity();

  return {
    aud: `https://vercel.com/${owner}`,
    connector_id: connectorId,
    email: 'test-user@passport.local',
    environment,
    external_sub: externalSubject,
    iss: `https://passport.vercel.com/${owner}`,
    name: 'Test User',
    owner,
    project,
    scope: subject,
    sub: subject,
    typ: 'passport',
  };
}

function warnAboutDevelopmentIdentity(): void {
  if (hasWarnedAboutDevelopmentIdentity) {
    return;
  }
  hasWarnedAboutDevelopmentIdentity = true;
  console.warn(
    '[@vercel/passport] Using a local development Passport identity. Set VERCEL_PASSPORT_DEV=0 or pass { development: false } to disable this behavior.'
  );
}

function parseLocalIdentity(value: string): PassportIdentityPayload {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      throw new PassportIdentityError(
        'Local Passport identity must be an object.'
      );
    }
    return parsed as PassportIdentityPayload;
  } catch (error) {
    if (error instanceof PassportIdentityError) {
      throw error;
    }
    throw new PassportIdentityError(
      'Local Passport identity must be valid JSON.'
    );
  }
}

function decodeJwtPayload(token: string): PassportIdentityPayload {
  const [, payload] = token.split('.');
  if (!payload) {
    throw new PassportIdentityError('Passport identity token is not a JWT.');
  }

  const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    '='
  );

  try {
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    throw new PassportIdentityError(
      'Passport identity token payload is invalid.'
    );
  }
}

export type PassportVerifyOptions = {
  projectId?: string | string[] | '*';
  environment?: string | string[] | '*';
  ownerId?: string;
} & JWTVerifyOptions;

async function verifyPassportToken(
  token: string,
  options?: PassportVerifyOptions
): Promise<PassportIdentityPayload> {
  const {
    algorithms,
    environment = process.env.VERCEL_TARGET_ENV || process.env.VERCEL_ENV,
    ownerId,
    projectId = process.env.VERCEL_PROJECT_ID,
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

  const unverifiedPayload = decodeJwtPayload(token);
  const { payload } = await jwtVerify<PassportIdentityPayload>(
    token,
    getJwksForIssuer(unverifiedPayload.iss),
    {
      ...verifyOptions,
      algorithms: algorithms ?? DEFAULT_ALGORITHMS,
    }
  );

  validateIssuer(payload.iss);
  validateClaim({
    actual: payload.project_id,
    claim: 'project_id',
    env: 'VERCEL_PROJECT_ID',
    expected: projectId,
    option: 'projectId',
  });
  validateClaim({
    actual: payload.environment,
    claim: 'environment',
    env: 'VERCEL_TARGET_ENV or VERCEL_ENV',
    expected: environment,
    option: 'environment',
  });
  validateOptionalClaim({
    actual: payload.owner_id,
    claim: 'owner_id',
    expected: ownerId,
  });

  return payload;
}

function hasAudienceVerification(
  audience: JWTVerifyOptions['audience']
): boolean {
  return Array.isArray(audience) ? audience.length > 0 : audience !== undefined;
}

function getJwksForIssuer(
  issuer: unknown
): ReturnType<typeof createRemoteJWKSet> {
  if (isPassportIssuer(issuer)) {
    return PASSPORT_JWKS;
  }
  if (isVercelOidcIssuer(issuer)) {
    return VERCEL_OIDC_JWKS;
  }

  throw new TypeError(
    `Expected Passport token iss claim to be "${PASSPORT_ISSUER}" or "${VERCEL_OIDC_ISSUER}" scoped to an owner.`
  );
}

function validateIssuer(actual: unknown): void {
  if (!isPassportIssuer(actual) && !isVercelOidcIssuer(actual)) {
    throw new TypeError(
      `Expected Passport token iss claim to be "${PASSPORT_ISSUER}" or "${VERCEL_OIDC_ISSUER}" scoped to an owner.`
    );
  }
}

function isPassportIssuer(value: unknown): value is string {
  return (
    value === PASSPORT_ISSUER ||
    (typeof value === 'string' && value.startsWith(`${PASSPORT_ISSUER}/`))
  );
}

function isVercelOidcIssuer(value: unknown): value is string {
  return (
    value === VERCEL_OIDC_ISSUER ||
    (typeof value === 'string' && value.startsWith(`${VERCEL_OIDC_ISSUER}/`))
  );
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
        ? `Expected Passport token ${claim} claim to be one of: ${expected.map(value => `"${value}"`).join(', ')}.`
        : `Expected Passport token ${claim} claim to be "${expected}".`
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
      `Expected Passport token ${claim} claim to be "${expected}".`
    );
  }
}

function validatePassportPayload(payload: PassportIdentityPayload): void {
  if (payload.typ !== 'passport') {
    throw new PassportIdentityError(
      'Passport identity token is missing typ="passport".'
    );
  }

  if (!payload.sub || typeof payload.sub !== 'string') {
    throw new PassportIdentityError(
      'Passport identity is missing a sub claim.'
    );
  }

  const owner = stringClaim(payload.owner);
  const connectorId = stringClaim(payload.connector_id);
  const externalSub = stringClaim(payload.external_sub);

  if (!owner) {
    throw new PassportIdentityError(
      'Passport identity is missing an owner claim.'
    );
  }
  if (!connectorId) {
    throw new PassportIdentityError(
      'Passport identity is missing a connector_id claim.'
    );
  }
  if (!externalSub) {
    throw new PassportIdentityError(
      'Passport identity is missing an external_sub claim.'
    );
  }

  const expectedSubject = `owner:${owner}:connector:${connectorId}:principal:${externalSub}`;
  if (payload.sub !== expectedSubject) {
    throw new PassportIdentityError(
      'Passport identity sub claim does not match owner, connector_id, and external_sub claims.'
    );
  }
  if (typeof payload.scope === 'string' && payload.scope !== expectedSubject) {
    throw new PassportIdentityError(
      'Passport identity scope claim does not match the Passport subject.'
    );
  }
}

function stringClaim(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
