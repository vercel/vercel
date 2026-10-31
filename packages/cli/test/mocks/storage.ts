import { client } from './client';
import type { StorageStore } from '../../src/util/storage/store';

export const BLOB_STORE_ID = 'store_blob123';
export const MARKETPLACE_STORE_ID = 'store_market123';

/** A Blob store with no connections — the happy path for `storage connect`. */
export function blobStore(overrides: Partial<StorageStore> = {}): StorageStore {
  return {
    id: BLOB_STORE_ID,
    name: 'my-blob-store',
    type: 'blob',
    status: 'available',
    projectsMetadata: [],
    ...overrides,
  };
}

/** A Marketplace resource, whose env var names are chosen by the provider. */
export function marketplaceStore(
  overrides: Partial<StorageStore> = {}
): StorageStore {
  return {
    id: MARKETPLACE_STORE_ID,
    name: 'my-acme-resource',
    type: 'integration',
    status: 'available',
    product: { name: 'Acme', slug: 'acme' },
    projectsMetadata: [],
    ...overrides,
  };
}

export function connectedBlobStore({
  environmentVariables,
  environments = ['production', 'preview', 'development'],
  envVarPrefix = null,
  projectId = 'prj_connected',
  projectName = 'connected-project',
}: {
  environmentVariables: string[];
  environments?: string[];
  envVarPrefix?: string | null;
  projectId?: string;
  projectName?: string;
}): StorageStore {
  return blobStore({
    projectsMetadata: [
      {
        id: 'spc_blob_1',
        projectId,
        name: projectName,
        environments,
        envVarPrefix,
        environmentVariables,
      },
    ],
  });
}

/**
 * Serves `GET /v1/storage/stores` and `GET /v1/storage/stores/:id`.
 *
 * `after` lets a test model the state the API reports once a mutation has been
 * applied, which is what the commands read back to report exact env var names.
 */
export function useStorageStores(
  stores: StorageStore[],
  options: { after?: StorageStore[] } = {}
): { listCalls: number } {
  const state = { listCalls: 0 };

  client.scenario.get('/:version/storage/stores', (_req, res) => {
    state.listCalls++;
    res.json({ stores });
  });

  client.scenario.get('/:version/storage/stores/:storeId', (req, res) => {
    const source = options.after ?? stores;
    const store = source.find(entry => entry.id === req.params.storeId);
    if (!store) {
      res.status(404).json({ error: { code: 'not_found', message: 'nope' } });
      return;
    }
    res.json({ store });
  });

  return state;
}

export interface RecordedRequest {
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
  storeId: string;
  connectionId?: string;
}

export function mockConnectStore(status = 201): RecordedRequest[] {
  const calls: RecordedRequest[] = [];
  client.scenario.post(
    '/:version/storage/stores/:storeId/connections',
    (req, res) => {
      calls.push({
        body: req.body,
        headers: req.headers,
        storeId: req.params.storeId,
      });
      res.status(status).json({});
    }
  );
  return calls;
}

export function mockConnectStoreError(
  status: number,
  body: unknown
): RecordedRequest[] {
  const calls: RecordedRequest[] = [];
  client.scenario.post(
    '/:version/storage/stores/:storeId/connections',
    (req, res) => {
      calls.push({
        body: req.body,
        headers: req.headers,
        storeId: req.params.storeId,
      });
      res.status(status).json(body);
    }
  );
  return calls;
}

export function mockUpdateConnection(): RecordedRequest[] {
  const calls: RecordedRequest[] = [];
  client.scenario.patch(
    '/:version/storage/stores/:storeId/connections/:connectionId',
    (req, res) => {
      calls.push({
        body: req.body,
        headers: req.headers,
        storeId: req.params.storeId,
        connectionId: req.params.connectionId,
      });
      res.status(200).json({});
    }
  );
  return calls;
}

export function mockUpgradeConnectionToOidc(): RecordedRequest[] {
  const calls: RecordedRequest[] = [];
  client.scenario.post(
    '/:version/storage/stores/:storeId/connections/:connectionId/upgrade-to-oidc',
    (req, res) => {
      calls.push({
        body: req.body,
        headers: req.headers,
        storeId: req.params.storeId,
        connectionId: req.params.connectionId,
      });
      res.status(200).json({});
    }
  );
  return calls;
}

export function mockDisconnectConnection(): RecordedRequest[] {
  const calls: RecordedRequest[] = [];
  client.scenario.delete(
    '/:version/storage/stores/:storeId/connections/:connectionId',
    (req, res) => {
      calls.push({
        body: req.body,
        headers: req.headers,
        storeId: req.params.storeId,
        connectionId: req.params.connectionId,
      });
      res.status(200).json({});
    }
  );
  return calls;
}

export function mockDisconnectAllConnections(): RecordedRequest[] {
  const calls: RecordedRequest[] = [];
  client.scenario.delete(
    '/:version/storage/stores/:storeId/connections',
    (req, res) => {
      calls.push({
        body: req.body,
        headers: req.headers,
        storeId: req.params.storeId,
      });
      res.status(200).json({});
    }
  );
  return calls;
}

export const EDGE_CONFIG_STORE_ID = 'ecfg_abc123';

/**
 * A Global Config as it appears on the provider-neutral store surface. The
 * API still reports the legacy `edge-config` type for these stores.
 */
export function edgeConfigStore(
  overrides: Partial<StorageStore> = {}
): StorageStore {
  return {
    id: EDGE_CONFIG_STORE_ID,
    name: 'flags',
    type: 'edge-config',
    status: 'available',
    projectsMetadata: [],
    ...overrides,
  };
}

export interface RecordedCreate {
  body: unknown;
  query: Record<string, unknown>;
}

/** Serves `POST /v1/storage/stores/blob`. */
export function mockCreateBlobStore(
  store: { id: string; name?: string; region?: string; access?: string } = {
    id: 'store_new123',
    region: 'iad1',
  }
): RecordedCreate[] {
  const calls: RecordedCreate[] = [];
  client.scenario.post('/:version/storage/stores/blob', (req, res) => {
    calls.push({ body: req.body, query: req.query });
    res.status(201).json({ store });
  });
  return calls;
}

/** Serves `POST /v1/global-config`. */
export function mockCreateGlobalConfig(
  config: { id: string; slug?: string; itemCount?: number } = {
    id: 'ecfg_new123',
    slug: 'flags',
    itemCount: 0,
  }
): RecordedCreate[] {
  const calls: RecordedCreate[] = [];
  client.scenario.post('/:version/global-config', (req, res) => {
    calls.push({ body: req.body, query: req.query });
    res.status(201).json(config);
  });
  return calls;
}

/** Serves `GET /v1/global-config/:id` for `storage get`. */
export function mockGetGlobalConfig(
  config: {
    id?: string;
    slug?: string;
    itemCount?: number;
    sizeInBytes?: number;
    digest?: string;
  } = { itemCount: 3, sizeInBytes: 128, digest: 'abc' }
): void {
  client.scenario.get('/:version/global-config/:id', (req, res) => {
    res.json({ id: req.params.id, ...config });
  });
}

/** Records `DELETE /v1/storage/stores/blob/:id`. */
export function mockDeleteBlobStore(): string[] {
  const deleted: string[] = [];
  client.scenario.delete(
    '/:version/storage/stores/blob/:storeId',
    (req, res) => {
      deleted.push(req.params.storeId);
      res.status(200).json({ store: { id: req.params.storeId } });
    }
  );
  return deleted;
}

/** Records `DELETE /v1/global-config/:id`. */
export function mockDeleteGlobalConfig(): string[] {
  const deleted: string[] = [];
  client.scenario.delete('/:version/global-config/:id', (req, res) => {
    deleted.push(req.params.id);
    res.status(200).json({});
  });
  return deleted;
}
