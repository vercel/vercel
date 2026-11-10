import type Client from '../client';

/**
 * A single store → project connection, as returned in `projectsMetadata` by
 * `GET /v1/storage/stores` and `GET /v1/storage/stores/:id`.
 *
 * `environmentVariables` holds the resolved env var *names* the connection owns
 * that are still present on the project. It is the only provider-neutral way to
 * learn the exact names of a Marketplace resource's variables, so the connect /
 * update / disconnect plans lean on it heavily.
 */
export interface StorageConnection {
  id: string;
  projectId: string;
  /** Project name, not the connection name. */
  name: string;
  environments: string[];
  envVarPrefix?: string | null;
  environmentVariables?: string[];
}

/**
 * Provider-neutral view of a store. Blob, Marketplace (`integration`), and the
 * first-party products (`postgres`, `redis`, `edge-config`, …) are all stores
 * behind the same `/v1/storage/stores` surface, which is what lets one resource
 * identifier work across all of them.
 */
export interface StorageStore {
  id: string;
  name: string;
  type?: string;
  status?: string | null;
  product?: {
    name?: string;
    slug?: string;
    integrationConfigurationId?: string;
  };
  projectsMetadata?: StorageConnection[];
}

/** Store types whose credentials can be issued through Vercel OIDC. */
const OIDC_CAPABLE_STORE_TYPES = new Set(['blob']);

const FIRST_PARTY_PRODUCT_LABELS: Record<string, string> = {
  blob: 'Vercel Blob',
  postgres: 'Vercel Postgres',
  redis: 'Vercel KV',
  'edge-config': 'Vercel Global Config',
  'global-config': 'Vercel Global Config',
};

export async function getStorageStores(
  client: Client,
  options: { accountId?: string } = {}
): Promise<StorageStore[]> {
  const response = await client.fetch<{ stores: StorageStore[] }>(
    '/v1/storage/stores',
    {
      json: true,
      accountId: options.accountId,
    }
  );
  return response.stores ?? [];
}

export async function getStorageStore(
  client: Client,
  storeId: string,
  options: { accountId?: string } = {}
): Promise<StorageStore> {
  const response = await client.fetch<{ store: StorageStore }>(
    `/v1/storage/stores/${encodeURIComponent(storeId)}`,
    {
      json: true,
      accountId: options.accountId,
    }
  );
  return response.store;
}

export type ResolveStoreResult =
  | { status: 'found'; store: StorageStore }
  | { status: 'not_found' }
  | { status: 'ambiguous'; matches: StorageStore[] };

/**
 * Resolves one resource identifier — a store ID or a store name — against every
 * store type. IDs win over names so an exact `store_…` argument is never
 * shadowed by a store that happens to be named after it.
 */
export function resolveStore(
  stores: StorageStore[],
  identifier: string
): ResolveStoreResult {
  const byId = stores.find(store => store.id === identifier);
  if (byId) {
    return { status: 'found', store: byId };
  }

  const byName = stores.filter(store => store.name === identifier);
  if (byName.length === 1) {
    return { status: 'found', store: byName[0] };
  }
  if (byName.length > 1) {
    return { status: 'ambiguous', matches: byName };
  }
  return { status: 'not_found' };
}

export function storeSupportsOidc(store: StorageStore): boolean {
  return OIDC_CAPABLE_STORE_TYPES.has(store.type ?? '');
}

/** Human-readable product name, e.g. `Vercel Blob` or a Marketplace product. */
export function storeProductLabel(store: StorageStore): string {
  if (store.product?.name) {
    return store.product.name;
  }
  const type = store.type ?? 'unknown';
  return FIRST_PARTY_PRODUCT_LABELS[type] ?? type;
}

export function getConnections(store: StorageStore): StorageConnection[] {
  return store.projectsMetadata ?? [];
}

export function getProjectConnections(
  store: StorageStore,
  projectId: string
): StorageConnection[] {
  return getConnections(store).filter(
    connection => connection.projectId === projectId
  );
}

/**
 * The connection a mutation should target. A project can hold several
 * connections to the same store (one per disjoint environment set), so callers
 * that only accept one target need to know when the choice is ambiguous.
 */
export type ConnectionTargetResult =
  | { status: 'found'; connection: StorageConnection }
  | { status: 'not_found' }
  | { status: 'ambiguous'; connections: StorageConnection[] };

export function resolveProjectConnection(
  store: StorageStore,
  projectId: string,
  environments?: string[]
): ConnectionTargetResult {
  const connections = getProjectConnections(store, projectId);
  if (connections.length === 0) {
    return { status: 'not_found' };
  }
  if (connections.length === 1) {
    return { status: 'found', connection: connections[0] };
  }

  if (environments?.length) {
    const overlapping = connections.filter(connection =>
      connection.environments.some(environment =>
        environments.includes(environment)
      )
    );
    if (overlapping.length === 1) {
      return { status: 'found', connection: overlapping[0] };
    }
    if (overlapping.length > 1) {
      return { status: 'ambiguous', connections: overlapping };
    }
  }

  return { status: 'ambiguous', connections };
}

/** Connections that overlap the requested environments, i.e. would collide. */
export function findOverlappingConnections(
  store: StorageStore,
  projectId: string,
  environments: string[]
): StorageConnection[] {
  return getProjectConnections(store, projectId).filter(connection =>
    connection.environments.some(environment =>
      environments.includes(environment)
    )
  );
}
