import { getVercelOidcToken } from '@vercel/oidc';
import type { ConnectAuthorizationDetail } from './authorization-details.js';

export type ConnectSubjectType = 'app' | 'user' | 'jwt-bearer';

export type ConnectTokenSubject =
  | ConnectAppTokenSubject
  | ConnectUserTokenSubject
  | ConnectJwtBearerTokenSubject;

export interface ConnectAppTokenSubject {
  type: 'app';
}

export interface ConnectUserTokenSubject {
  type: 'user';
  id: string;
  issuer?: string;
}

export interface ConnectJwtBearerTokenSubject {
  type: 'jwt-bearer';
  sub: string;
  /** Defaults to the connector's OAuth client id. */
  iss?: string;
  /** Defaults to the connector's OAuth token endpoint. */
  aud?: string;
  additionalClaims?: Record<string, unknown>;
}

export interface ConnectTokenParams {
  subject: ConnectTokenSubject;
  installationId?: string;
  audience?: string[];
  /**
   * Access scopes to request. Use `['*']` to request the default scopes for
   * the specified subject type.
   */
  scopes?: string[];
  resources?: string[];
  authorizationDetails?: ConnectAuthorizationDetail[];

  /**
   * Buffer time in milliseconds before token expiration to consider it invalid.
   * If the token expires within this buffer, it will be refreshed.
   * Defaults to 30 seconds.
   */
  validityBufferMs?: number;
}

export interface ConnectTokenResponse {
  token: string;
  /** Token expiration timestamp in milliseconds since epoch. */
  expiresAt: number;
  connector: {
    /** Opaque Vercel Connect connector id. */
    id: string;
    /** Human-readable Vercel Connect connector UID. */
    uid: string;
    /** Vercel Connect connector type identifier. */
    type: string;
  };
  name?: string;
  installationId?: string;
  tenantId?: string;
  externalSubject?: string;
  /** Driver-specific metadata stored during OAuth */
  metadata?: Record<string, unknown>;
}

export type ConnectVendorErrorPayload = Record<string, unknown>;

export interface ConnectErrorOptions {
  code?: string;
  status?: number;
  statusText?: string;
  vendor?: ConnectVendorErrorPayload;
}

export class ConnectError extends Error {
  readonly code?: string;
  readonly status?: number;
  readonly statusText?: string;
  readonly vendor?: ConnectVendorErrorPayload;

  constructor(message: string, options: ConnectErrorOptions = {}) {
    super(message);
    this.name = 'ConnectError';
    this.code = options.code;
    this.status = options.status;
    this.statusText = options.statusText;
    this.vendor = options.vendor;
  }
}

export class NoValidTokenError extends ConnectError {
  constructor(message: string, options?: ConnectErrorOptions) {
    super(message, options);
    this.name = 'NoValidTokenError';
  }
}

export class UserAuthorizationRequiredError extends ConnectError {
  constructor(message: string, options?: ConnectErrorOptions) {
    super(message, options);
    this.name = 'UserAuthorizationRequiredError';
  }
}

export class ConnectorInstallationRequiredError extends ConnectError {
  constructor(message: string, options?: ConnectErrorOptions) {
    super(message, options);
    this.name = 'ConnectorInstallationRequiredError';
  }
}

export interface ConnectOptions {
  vercelToken?: string;

  /**
   * Bypass the in-process token cache and re-fetch from Vercel Connect.
   *
   * The cache normally serves any token that is not within
   * {@link ConnectTokenParams.validityBufferMs} of expiry. That means a
   * grant the user revoked server-side keeps being handed back from the
   * local cache until it expires. Set `forceRefresh` when the caller
   * needs Connect to re-validate the grant on this call — a revoked grant
   * then surfaces as `no_token` / `user_authorization_required` instead of
   * a stale bearer.
   */
  forceRefresh?: boolean;
}

export async function getToken(
  connector: string,
  params: ConnectTokenParams,
  options?: ConnectOptions
): Promise<string> {
  const { token } = await getTokenResponse(connector, params, options);
  return token;
}

export async function getTokenResponse(
  connector: string,
  params: ConnectTokenParams,
  options?: ConnectOptions
): Promise<ConnectTokenResponse> {
  const bufferMs = params.validityBufferMs ?? DEFAULT_VALIDITY_BUFFER_MS;
  const cacheKey = tokenCacheKey(connector, params);

  if (options?.forceRefresh) {
    cache.delete(cacheKey);
  } else {
    const cached = cache.get(cacheKey);
    if (cached) {
      const now = Date.now();
      if (cached.response.expiresAt - now > bufferMs) {
        cached.lastUsed = now;
        return cached.response;
      }
      cache.delete(cacheKey);
    }
  }

  const vercelToken = options?.vercelToken ?? (await getVercelOidcToken());

  const endpoint = `https://api.vercel.com/v1/connect/token/${encodeURIComponent(connector)}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${vercelToken}`,
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw await createConnectErrorFromResponse(response, 'Failed to get token');
  }

  const data: ConnectTokenResponse = await response.json();

  if (cache.size >= MAX_CACHE_SIZE) {
    evictLru();
  }
  cache.set(cacheKey, { response: data, lastUsed: Date.now() });

  return data;
}

export async function revokeToken(
  connector: string,
  params: {
    subject: ConnectTokenSubject;
    installationId?: string;
  },
  options?: ConnectOptions
): Promise<void> {
  const vercelToken = options?.vercelToken ?? (await getVercelOidcToken());
  const endpoint = `https://api.vercel.com/v1/connect/connectors/${encodeURIComponent(connector)}/tokens`;

  const response = await fetch(endpoint, {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${vercelToken}`,
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw await createConnectErrorFromResponse(
      response,
      'Failed to revoke token'
    );
  }

  cache.clear();
}

/**
 * Remove a single cached token entry for `(connector, params)` from the
 * in-process cache.
 *
 * Targeted counterpart to {@link revokeToken}'s `cache.clear()`: it drops
 * exactly the entry {@link getTokenResponse} would serve for these
 * arguments, leaving every other connector/principal untouched. Use it
 * when a credential is known to be bad (the resource server rejected the
 * bearer with a `401`) so the next {@link getTokenResponse} re-fetches
 * instead of re-serving the rejected token — without paying for a Connect
 * round trip on every call the way {@link ConnectOptions.forceRefresh}
 * does.
 *
 * The cache key is derived from `connector` plus every field of `params`,
 * so pass the same `params` used for the original {@link getTokenResponse}
 * call. No-op when no matching entry exists.
 */
export function deleteTokenCacheEntry(
  connector: string,
  params: ConnectTokenParams
): void {
  cache.delete(tokenCacheKey(connector, params));
}

const DEFAULT_VALIDITY_BUFFER_MS = 30_000;
const MAX_CACHE_SIZE = 100;

interface CacheEntry {
  response: ConnectTokenResponse;
  lastUsed: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Cache key for a `(connector, params)` pair. Stable across calls with
 * equal arguments so {@link getTokenResponse} and
 * {@link deleteTokenCacheEntry} address the same entry.
 */
function tokenCacheKey(connector: string, params: ConnectTokenParams): string {
  return JSON.stringify({ connector, ...params });
}

function evictLru(): void {
  let oldestKey: string | undefined;
  let oldestTime = Infinity;
  for (const [key, entry] of cache) {
    if (entry.lastUsed < oldestTime) {
      oldestTime = entry.lastUsed;
      oldestKey = key;
    }
  }
  if (oldestKey !== undefined) {
    cache.delete(oldestKey);
  }
}

interface ParsedConnectErrorResponse {
  bodyText?: string;
  code?: string;
  message?: string;
  vendor?: ConnectVendorErrorPayload;
}

export async function createConnectErrorFromResponse(
  response: Response,
  fallbackMessage: string
): Promise<ConnectError> {
  const parsedError = await readConnectErrorResponse(response);
  return createConnectError(response, parsedError, fallbackMessage);
}

function createConnectError(
  response: Response,
  parsedError: ParsedConnectErrorResponse,
  fallbackMessage: string
): ConnectError {
  const { code, message, bodyText } = parsedError;
  const errorOptions = connectErrorOptions(response, parsedError);

  if (code === 'no_token') {
    return new NoValidTokenError(
      message || bodyText || 'No valid token available',
      errorOptions
    );
  }

  if (code === 'user_authorization_required') {
    return new UserAuthorizationRequiredError(
      message || bodyText || 'User authorization is required',
      errorOptions
    );
  }

  if (
    code === 'client_installation_required' ||
    code === 'connector_installation_required'
  ) {
    return new ConnectorInstallationRequiredError(
      message || bodyText || 'Connector installation is required',
      errorOptions
    );
  }

  return new ConnectError(
    buildConnectResponseErrorMessage(response, parsedError, fallbackMessage),
    errorOptions
  );
}

async function readConnectErrorResponse(
  response: Response
): Promise<ParsedConnectErrorResponse> {
  let bodyText: string | undefined;
  try {
    bodyText = await response.text();
  } catch {}

  if (!bodyText) {
    return {};
  }

  try {
    const body = JSON.parse(bodyText);
    if (!isRecord(body)) {
      return { bodyText };
    }

    const error = isRecord(body.error)
      ? body.error
      : isRecord(body.err)
        ? body.err
        : undefined;

    if (!error) {
      return { bodyText, vendor: vendorPayload(body) };
    }

    return {
      bodyText,
      code: typeof error.code === 'string' ? error.code : undefined,
      message: typeof error.message === 'string' ? error.message : undefined,
      vendor: vendorPayload(error) ?? vendorPayload(body),
    };
  } catch {
    return { bodyText };
  }
}

function connectErrorOptions(
  response: Response,
  parsedError: ParsedConnectErrorResponse
): ConnectErrorOptions {
  return {
    code: parsedError.code,
    status: response.status,
    statusText: response.statusText,
    vendor: parsedError.vendor,
  };
}

function buildConnectResponseErrorMessage(
  response: Response,
  parsedError: ParsedConnectErrorResponse,
  fallbackMessage: string
): string {
  if (parsedError.message) {
    return parsedError.message;
  }

  return [
    `${fallbackMessage}:`,
    `${response.status}`,
    response.statusText,
    parsedError.code ? ` - ${parsedError.code}` : '',
    parsedError.bodyText ? ` - ${parsedError.bodyText}` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function vendorPayload(
  error: Record<string, unknown>
): ConnectVendorErrorPayload | undefined {
  if (isRecord(error.vendor)) {
    return error.vendor;
  }

  if (isRecord(error.meta) && isRecord(error.meta.vendor)) {
    return error.meta.vendor;
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
