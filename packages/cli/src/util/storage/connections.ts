import type Client from '../client';
import { storageAuthHeaders, type ResolvedStorageAuth } from './auth';
import { storeSupportsOidc, type StorageStore } from './store';

interface ConnectionRequestBase {
  store: StorageStore;
  connectionId?: string;
  accountId?: string;
}

/**
 * Creates a store → project connection.
 *
 * The OIDC credential path is opted into with the `x-vercel-use-oidc` request
 * header, and the static read-write token is suppressed with
 * `skipReadWriteToken` unless the caller explicitly asked for it. Both are
 * driven by documented flags rather than being baked in here.
 */
export async function connectStoreToProject(
  client: Client,
  {
    store,
    projectId,
    environments,
    envVarPrefix,
    auth,
    accountId,
  }: ConnectionRequestBase & {
    projectId: string;
    environments: string[];
    envVarPrefix?: string;
    auth: ResolvedStorageAuth;
  }
): Promise<void> {
  await client.fetch(
    `/v1/storage/stores/${encodeURIComponent(store.id)}/connections`,
    {
      json: true,
      method: 'POST',
      headers: storageAuthHeaders(auth),
      body: {
        projectId,
        envVarEnvironments: environments,
        ...(envVarPrefix !== undefined ? { envVarPrefix } : {}),
        // `skipReadWriteToken` only governs the Blob read-write token; sending
        // it for provider-managed resources risks filtering a provider secret
        // that happens to share the name.
        ...(storeSupportsOidc(store) && !auth.readWriteToken
          ? { skipReadWriteToken: true }
          : {}),
      },
      accountId,
    }
  );
}

export async function updateStoreConnection(
  client: Client,
  {
    store,
    connectionId,
    environments,
    envVarPrefix,
    skipReadWriteToken,
    accountId,
  }: ConnectionRequestBase & {
    connectionId: string;
    environments?: string[];
    envVarPrefix?: string | null;
    skipReadWriteToken?: boolean;
  }
): Promise<void> {
  await client.fetch(
    `/v1/storage/stores/${encodeURIComponent(store.id)}/connections/${encodeURIComponent(connectionId)}`,
    {
      json: true,
      method: 'PATCH',
      body: {
        ...(environments !== undefined
          ? { envVarEnvironments: environments }
          : {}),
        ...(envVarPrefix !== undefined ? { envVarPrefix } : {}),
        ...(skipReadWriteToken !== undefined ? { skipReadWriteToken } : {}),
      },
      accountId,
    }
  );
}

/**
 * Moves an existing connection onto the OIDC credential path. Additive on the
 * API side: the static token is preserved, so callers that want it gone follow
 * up with `updateStoreConnection({ skipReadWriteToken: true })`.
 */
export async function upgradeStoreConnectionToOidc(
  client: Client,
  {
    store,
    connectionId,
    auth,
    accountId,
  }: ConnectionRequestBase & {
    connectionId: string;
    auth: ResolvedStorageAuth;
  }
): Promise<void> {
  await client.fetch(
    `/v1/storage/stores/${encodeURIComponent(store.id)}/connections/${encodeURIComponent(connectionId)}/upgrade-to-oidc`,
    {
      json: true,
      method: 'POST',
      headers: storageAuthHeaders(auth),
      accountId,
    }
  );
}

export async function disconnectStoreConnection(
  client: Client,
  {
    store,
    connectionId,
    accountId,
  }: ConnectionRequestBase & { connectionId: string }
): Promise<void> {
  await client.fetch(
    `/v1/storage/stores/${encodeURIComponent(store.id)}/connections/${encodeURIComponent(connectionId)}`,
    {
      json: true,
      method: 'DELETE',
      accountId,
    }
  );
}

export async function disconnectAllStoreConnections(
  client: Client,
  { store, accountId }: ConnectionRequestBase
): Promise<void> {
  await client.fetch(
    `/v1/storage/stores/${encodeURIComponent(store.id)}/connections`,
    {
      json: true,
      method: 'DELETE',
      accountId,
    }
  );
}
