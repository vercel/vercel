import { getVercelOidcToken } from '@vercel/oidc';

export interface ConnectTokenParams {
  subject: { type: 'app' } | { type: 'user'; id: string; issuer?: string };
  installationId?: string;
  audience?: string[];
  scopes?: string[];
  resources?: string[];
  authorizationDetails?: Array<{ type: string } & Record<string, unknown>>;

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
  const cacheKey = JSON.stringify({ connector, ...params });

  const cached = cache.get(cacheKey);
  if (cached) {
    const now = Date.now();
    if (cached.response.expiresAt - now > bufferMs) {
      cached.lastUsed = now;
      return cached.response;
    }
    cache.delete(cacheKey);
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

const DEFAULT_VALIDITY_BUFFER_MS = 30_000;
const MAX_CACHE_SIZE = 100;

interface CacheEntry {
  response: ConnectTokenResponse;
  lastUsed: number;
}

const cache = new Map<string, CacheEntry>();

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
