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
  external_iss?: string;
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
  externalIssuer?: string;
  externalSubject?: string;
  connectorId?: string;
  email?: string;
  name?: string;
  owner: {
    id?: string;
    slug: string;
  };
  project?: {
    id?: string;
    name?: string;
  };
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

export interface PassportDevelopmentIdentityOptions {
  audience?: string;
  connectorId?: string;
  enabled?: boolean;
  environment?: string;
  externalIssuer?: string;
  externalSubject?: string;
  issuer?: string;
  owner?: string;
  ownerId?: string;
  project?: string;
  projectId?: string;
}

export interface PassportIdentityOptions {
  /**
   * Verify an explicit local token against Passport JWKS. Request-context,
   * header, and cookie tokens are always verified.
   */
  verify?: boolean;
  /**
   * Allow a decoded but unverified explicit local token when `verify` is false.
   */
  allowUnverified?: boolean;
  /**
   * Local development identity generation used when no Passport header/cookie
   * exists. Defaults to enabled outside production and outside Vercel. Set to
   * false to disable.
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
   * Environment variable name containing a Passport JWT for local debugging.
   * Defaults to `VERCEL_PASSPORT_TOKEN`.
   */
  localTokenEnv?: string;
  /**
   * Options forwarded to the JWT verifier when verifying the token.
   */
  verifyOptions?: PassportVerifyOptions;
}

const PASSPORT_ISSUER = 'https://passport.vercel.com';
const VERCEL_OIDC_ISSUER = 'https://oidc.vercel.com';
const PASSPORT_JWKS = createRemoteJWKSet(
  new URL(`${VERCEL_OIDC_ISSUER}/.well-known/jwks`)
);
const DEFAULT_ALGORITHMS = ['RS256'];
const SYMBOL_FOR_REQ_CONTEXT = Symbol.for('@vercel/request-context');
let hasWarnedAboutDevelopmentIdentity = false;

type RequestContext = {
  headers?: Record<string, string>;
};

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
 * `x-vercel-oidc-passport-token` header and supports explicit cookie/token
 * overrides for tests and local debugging. Request tokens are always verified
 * against the dedicated Passport issuer and must include Passport-specific
 * claims.
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
    normalized.cookieHeader,
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
    const shouldVerify =
      tokenSource === 'local' ? (options.verify ?? false) : true;
    if (shouldVerify) {
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
    externalIssuer: stringClaim(payload.external_iss),
    externalSubject: stringClaim(payload.external_sub),
    connectorId: stringClaim(payload.connector_id),
    email: stringClaim(payload.email),
    name: stringClaim(payload.name),
    owner: {
      id: stringClaim(payload.owner_id),
      slug: stringClaim(payload.owner)!,
    },
    project: createProjectIdentity(payload),
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
  if (!isLocalDevelopmentEnvironment()) {
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
  const ownerId = config.ownerId ?? process.env.VERCEL_PASSPORT_DEV_OWNER_ID;
  const connectorId =
    config.connectorId ??
    process.env.VERCEL_PASSPORT_DEV_CONNECTOR_ID ??
    'local';
  const externalIssuer =
    config.externalIssuer ?? process.env.VERCEL_PASSPORT_DEV_EXTERNAL_ISS;
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
  const projectId =
    config.projectId ??
    process.env.VERCEL_PASSPORT_DEV_PROJECT_ID ??
    process.env.VERCEL_PROJECT_ID;
  const issuer =
    config.issuer ??
    process.env.VERCEL_PASSPORT_DEV_ISSUER ??
    `${PASSPORT_ISSUER}/${owner}`;
  const audience =
    config.audience ??
    process.env.VERCEL_PASSPORT_DEV_AUDIENCE ??
    `https://vercel.com/${owner}/${project}/${environment}`;
  const subject = `owner:${owner}:connector:${connectorId}:principal:${externalSubject}`;

  warnAboutDevelopmentIdentity();

  return {
    aud: audience,
    connector_id: connectorId,
    email: 'test-user@passport.local',
    environment,
    ...(externalIssuer ? { external_iss: externalIssuer } : {}),
    external_sub: externalSubject,
    iss: issuer,
    name: 'Test User',
    owner,
    ...(ownerId ? { owner_id: ownerId } : {}),
    project,
    ...(projectId ? { project_id: projectId } : {}),
    scope: subject,
    sub: subject,
    typ: 'passport',
  };
}

function isLocalDevelopmentEnvironment(): boolean {
  if (process.env.VERCEL === '1' && process.env.VERCEL_ENV !== 'development') {
    return false;
  }

  return (
    process.env.VERCEL_ENV === undefined ||
    process.env.VERCEL_ENV === '' ||
    process.env.VERCEL_ENV === 'development'
  );
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
  validateIssuer(issuer);
  return PASSPORT_JWKS;
}

function validateIssuer(actual: unknown): void {
  if (!isPassportIssuer(actual)) {
    throw new TypeError(
      `Expected Passport token iss claim to be "${PASSPORT_ISSUER}" scoped to an owner.`
    );
  }
}

function isPassportIssuer(value: unknown): value is string {
  return (
    value === PASSPORT_ISSUER ||
    (typeof value === 'string' && value.startsWith(`${PASSPORT_ISSUER}/`))
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

  if (!payload.iss || typeof payload.iss !== 'string') {
    throw new PassportIdentityError(
      'Passport identity is missing an iss claim.'
    );
  }
  validateIssuer(payload.iss);

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
}

function createProjectIdentity(
  payload: PassportIdentityPayload
): PassportIdentity['project'] {
  const id = stringClaim(payload.project_id);
  const name = stringClaim(payload.project);

  return id || name ? { id, name } : undefined;
}

function stringClaim(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
