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

export class NoValidTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoValidTokenError';
  }
}

export class UserAuthorizationRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserAuthorizationRequiredError';
  }
}

export class ConnectorInstallationRequiredError extends Error {
  constructor(message: string) {
    super(message);
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
    let errorText: string | undefined;
    let errorObject:
      | { error?: { code?: string; message?: string } }
      | undefined;
    try {
      errorText = await response.text();
      const errorJson = JSON.parse(errorText);
      if (typeof errorJson === 'object' && errorJson !== null) {
        errorObject = errorJson;
      }
    } catch {}
    const code = errorObject?.error?.code;
    const message = errorObject?.error?.message;
    if (code === 'no_token') {
      throw new NoValidTokenError(
        message || errorText || 'No valid token available'
      );
    }
    if (code === 'user_authorization_required') {
      throw new UserAuthorizationRequiredError(
        message || errorText || 'User authorization is required'
      );
    }
    if (
      code === 'client_installation_required' ||
      code === 'connector_installation_required'
    ) {
      throw new ConnectorInstallationRequiredError(
        message || errorText || 'Connector installation is required'
      );
    }
    throw new Error(
      [
        'Failed to get token:',
        `${response.status}`,
        response.statusText,
        code ? ` - ${code}` : '',
        errorText ? ` - ${errorText}` : '',
      ]
        .filter(Boolean)
        .join(' ')
    );
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
