import { getVercelOidcToken } from '@vercel/oidc';
import type { ConnectOptions } from '../token.js';
import { ConnectError, createConnectErrorFromResponse } from '../token.js';
import type { EveConnectionAuthorizationContext } from './connection-authorization.js';

const MANAGED_OAUTH_CONNECTOR_ENDPOINT =
  'https://api.vercel.com/v1/connect/connectors/managed/oauth';

const RESERVED_UID_PATTERN = /^(vc\/|[^/]*\.vercel\.com\/)/;
const ALLOWED_RESERVED_UID_PREFIXES = ['mcp.vercel.com/'];
const RESERVED_ID_PREFIXES = ['scl_', 'sca_', 'store_', 'ir_'];
const INVALID_UID_CHARS = /[\s%#]/;
const MAX_PROVISION_CACHE_ENTRIES = 100;

export interface EveOAuthProvisioningIdentity {
  /** Authoritative Connect service identifier, such as `mcp.linear.app`. */
  readonly service?: string;
  /** Registry name used to resolve a team connector. Defaults to `connector`. */
  readonly canonicalName?: string;
}

export interface ResolvedEveOAuthConnector {
  readonly id: string;
  readonly uid: string;
  readonly service?: string;
  readonly type: 'oauth';
  readonly supportedSubjectTypes?: readonly string[];
}

export class ExplicitSetupRequiredError extends Error {
  readonly reason?: string;
  readonly connector?: { readonly id: string; readonly uid: string };

  constructor(
    message: string,
    options: {
      readonly reason?: string;
      readonly connector?: { readonly id: string; readonly uid: string };
    } = {}
  ) {
    super(message);
    this.name = 'ExplicitSetupRequiredError';
    this.reason = options.reason;
    this.connector = options.connector;
  }
}

interface CacheEntry {
  readonly promise: Promise<ResolvedEveOAuthConnector | undefined>;
  readonly expiresAt: number;
}

const provisionCache = new Map<string, CacheEntry>();

interface ProvisionEveOAuthConnectorOptions {
  readonly connector: string;
  readonly connection: EveConnectionAuthorizationContext;
  readonly principalType: string;
  readonly provisioning?: EveOAuthProvisioningIdentity;
  readonly connectOptions?: ConnectOptions;
}

export async function provisionEveOAuthConnector({
  connector,
  connection,
  principalType,
  provisioning,
  connectOptions,
}: ProvisionEveOAuthConnectorOptions): Promise<
  ResolvedEveOAuthConnector | undefined
> {
  const serverUrl = resolveServerUrl(connection);
  if (serverUrl === undefined || !isProvisionableConnectorUid(connector)) {
    return undefined;
  }

  const vercelToken =
    connectOptions?.vercelToken ?? (await getVercelOidcToken());
  const service = provisioning?.service ?? serviceFromServerUrl(serverUrl);
  const cacheKey = JSON.stringify({
    mode: 'managed-oauth',
    connector,
    canonicalName: provisioning?.canonicalName ?? connector,
    service,
    principalType,
    serverUrl,
    token: await tokenCacheKeyPart(vercelToken),
  });
  const now = Date.now();
  const cached = provisionCache.get(cacheKey);
  if (cached !== undefined && cached.expiresAt > now) {
    // Keep hot entries at the end, making eviction LRU.
    provisionCache.delete(cacheKey);
    provisionCache.set(cacheKey, cached);
    return cached.promise;
  }
  if (cached !== undefined) provisionCache.delete(cacheKey);

  const promise = provisionManagedOAuthConnector({
    connector,
    canonicalName: provisioning?.canonicalName ?? connector,
    service,
    principalType,
    serverUrl,
    vercelToken,
  }).catch(error => {
    if (isNonOAuthConnectorConflict(error)) return undefined;
    provisionCache.delete(cacheKey);
    throw error;
  });
  provisionCache.set(cacheKey, { promise, expiresAt: oidcExpiry(vercelToken) });
  while (provisionCache.size > MAX_PROVISION_CACHE_ENTRIES) {
    const oldest = provisionCache.keys().next().value;
    if (oldest === undefined) break;
    provisionCache.delete(oldest);
  }
  return promise;
}

function resolveServerUrl(
  connection: EveConnectionAuthorizationContext
): string | undefined {
  const url = connection.url;
  if (typeof url !== 'string') return undefined;
  const trimmed = url.trim();
  return trimmed === '' ? undefined : trimmed;
}

function serviceFromServerUrl(serverUrl: string): string | undefined {
  try {
    return new URL(serverUrl).host || undefined;
  } catch {
    return undefined;
  }
}

function isProvisionableConnectorUid(connector: string): boolean {
  if (connector === '' || INVALID_UID_CHARS.test(connector)) return false;
  for (let index = 0; index < connector.length; index++) {
    const code = connector.charCodeAt(index);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return false;
  }
  const normalized = connector.toLowerCase();
  if (RESERVED_ID_PREFIXES.some(prefix => normalized.startsWith(prefix)))
    return false;
  return !(
    RESERVED_UID_PATTERN.test(normalized) &&
    !ALLOWED_RESERVED_UID_PREFIXES.some(prefix => normalized.startsWith(prefix))
  );
}

function oidcExpiry(token: string): number {
  try {
    const payload = JSON.parse(
      atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
    );
    if (typeof payload.exp === 'number') return payload.exp * 1000;
  } catch {
    // Opaque development tokens are still bounded, rather than living forever.
  }
  return Date.now() + 5 * 60 * 1000;
}

async function tokenCacheKeyPart(token: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const digest = await subtle.digest(
      'SHA-256',
      new TextEncoder().encode(token)
    );
    return Array.from(new Uint8Array(digest), byte =>
      byte.toString(16).padStart(2, '0')
    ).join('');
  }
  let hash = 2166136261;
  for (let index = 0; index < token.length; index++) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${token.length}:${hash >>> 0}`;
}

function isNonOAuthConnectorConflict(error: unknown): boolean {
  return (
    error instanceof ConnectError &&
    error.status === 409 &&
    error.code === 'unsupported_connector_type'
  );
}

async function provisionManagedOAuthConnector({
  connector,
  canonicalName,
  service,
  principalType,
  serverUrl,
  vercelToken,
}: {
  readonly connector: string;
  readonly canonicalName: string;
  readonly service?: string;
  readonly principalType: string;
  readonly serverUrl: string;
  readonly vercelToken: string;
}): Promise<ResolvedEveOAuthConnector> {
  const response = await fetch(MANAGED_OAUTH_CONNECTOR_ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${vercelToken}`,
    },
    body: JSON.stringify({
      uid: connector,
      canonicalName,
      ...(service ? { service } : {}),
      serverUrl,
      principalType,
    }),
  });
  if (!response.ok) {
    // ConnectError deliberately only exposes its documented `vendor` envelope.
    // This endpoint's structured setup details live directly under `error`, so
    // read a clone to avoid changing error semantics for every SDK client.
    const details = await structuredErrorDetails(response.clone());
    const error = await createConnectErrorFromResponse(
      response,
      'Failed to provision connector'
    );
    if (error.code === 'explicit_setup_required') {
      const vendor = error.vendor ?? details;
      throw new ExplicitSetupRequiredError(
        'Vercel Connect requires explicit connector setup. Run `eve integration connect` to select or attach a compatible connector.',
        {
          reason: typeof vendor.reason === 'string' ? vendor.reason : undefined,
          connector: isConnector(vendor.connector)
            ? vendor.connector
            : undefined,
        }
      );
    }
    throw error;
  }
  const payload: unknown = await response.json();
  const value =
    isRecord(payload) && isRecord(payload.connector)
      ? payload.connector
      : payload;
  if (!isConnector(value) || value.type !== 'oauth') {
    throw new Error('Invalid managed OAuth provisioning response.');
  }
  if (service !== undefined && value.service !== service) {
    throw new Error(
      'Managed OAuth provisioning returned a connector for a different service.'
    );
  }
  if (
    service !== undefined &&
    (value.supportedSubjectTypes === undefined ||
      !value.supportedSubjectTypes.includes(principalType))
  ) {
    throw new ExplicitSetupRequiredError(
      'The resolved connector does not support the requested principal type.',
      { connector: value }
    );
  }
  return value;
}

async function structuredErrorDetails(
  response: Response
): Promise<Record<string, unknown>> {
  try {
    const payload: unknown = await response.json();
    if (isRecord(payload) && isRecord(payload.error)) return payload.error;
  } catch {
    // createConnectErrorFromResponse supplies the normal error below.
  }
  return {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isConnector(value: unknown): value is ResolvedEveOAuthConnector {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.uid === 'string' &&
    typeof value.type === 'string' &&
    (value.service === undefined || typeof value.service === 'string') &&
    (value.supportedSubjectTypes === undefined ||
      (Array.isArray(value.supportedSubjectTypes) &&
        value.supportedSubjectTypes.every(type => typeof type === 'string')))
  );
}
