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

const provisionCache = new Map<string, Promise<void>>();

interface ProvisionEveOAuthConnectorOptions {
  readonly connector: string;
  readonly connection: EveConnectionAuthorizationContext;
  readonly connectOptions?: ConnectOptions;
}

export async function provisionEveOAuthConnector({
  connector,
  connection,
  connectOptions,
}: ProvisionEveOAuthConnectorOptions): Promise<void> {
  const serverUrl = resolveServerUrl(connection);
  if (serverUrl === undefined || !isProvisionableConnectorUid(connector)) {
    return;
  }

  const vercelToken =
    connectOptions?.vercelToken ?? (await getVercelOidcToken());
  const cacheKey = JSON.stringify({
    connector,
    serverUrl,
    token: await tokenCacheKeyPart(vercelToken),
  });
  let promise = provisionCache.get(cacheKey);
  if (promise === undefined) {
    promise = provisionManagedOAuthConnector({
      connector,
      serverUrl,
      vercelToken,
    }).catch(error => {
      if (isNonOAuthConnectorConflict(error)) {
        return;
      }
      provisionCache.delete(cacheKey);
      throw error;
    });
    provisionCache.set(cacheKey, promise);
  }

  await promise;
}

function resolveServerUrl(
  connection: EveConnectionAuthorizationContext
): string | undefined {
  const url = connection.url;
  if (typeof url !== 'string') {
    return undefined;
  }
  const trimmed = url.trim();
  return trimmed === '' ? undefined : trimmed;
}

function isProvisionableConnectorUid(connector: string): boolean {
  if (connector === '' || INVALID_UID_CHARS.test(connector)) {
    return false;
  }

  for (let index = 0; index < connector.length; index++) {
    const code = connector.charCodeAt(index);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) {
      return false;
    }
  }

  const normalized = connector.toLowerCase();
  if (RESERVED_ID_PREFIXES.some(prefix => normalized.startsWith(prefix))) {
    return false;
  }
  if (
    RESERVED_UID_PATTERN.test(normalized) &&
    !ALLOWED_RESERVED_UID_PREFIXES.some(prefix => normalized.startsWith(prefix))
  ) {
    return false;
  }
  return true;
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
    /not an OAuth connector/i.test(error.message)
  );
}

async function provisionManagedOAuthConnector({
  connector,
  serverUrl,
  vercelToken,
}: {
  readonly connector: string;
  readonly serverUrl: string;
  readonly vercelToken: string;
}): Promise<void> {
  const response = await fetch(MANAGED_OAUTH_CONNECTOR_ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${vercelToken}`,
    },
    body: JSON.stringify({ serverUrl, uid: connector }),
  });

  if (!response.ok) {
    throw await createConnectErrorFromResponse(
      response,
      'Failed to provision connector'
    );
  }
}
