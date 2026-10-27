import { describe, expect, it } from 'vitest';
import {
  blobEnvVarNames,
  diffEnvVarNames,
  normalizeEnvVarPrefix,
  planConnectEnvVars,
  planDisconnectEnvVars,
  planUpdateEnvVars,
} from '../../../../src/util/storage/env-vars';
import {
  inferConnectionAuth,
  parseAuthMode,
  resolveStorageAuth,
  storageAuthHeaders,
} from '../../../../src/util/storage/auth';
import {
  resolveStore,
  storeProductLabel,
  storeSupportsOidc,
  type StorageStore,
} from '../../../../src/util/storage/store';

const blob: StorageStore = {
  id: 'store_blob',
  name: 'blobby',
  type: 'blob',
  projectsMetadata: [],
};

const marketplace: StorageStore = {
  id: 'store_market',
  name: 'acme-db',
  type: 'integration',
  product: { name: 'Acme', slug: 'acme' },
  projectsMetadata: [],
};

function oidcAuth(readWriteToken = false) {
  const result = resolveStorageAuth({
    store: blob,
    mode: 'oidc',
    addRwToken: readWriteToken,
  });
  if (!result.valid) {
    throw new Error(result.error);
  }
  return result.auth;
}

describe('normalizeEnvVarPrefix', () => {
  it('strips trailing underscores so names never double up', () => {
    expect(normalizeEnvVarPrefix('UPLOADS_')).toEqual('UPLOADS');
    expect(normalizeEnvVarPrefix('UPLOADS__')).toEqual('UPLOADS');
    expect(normalizeEnvVarPrefix('UPLOADS')).toEqual('UPLOADS');
  });

  it('treats empty and missing prefixes the same', () => {
    expect(normalizeEnvVarPrefix(undefined)).toBeUndefined();
    expect(normalizeEnvVarPrefix(null)).toBeUndefined();
    expect(normalizeEnvVarPrefix('_')).toBeUndefined();
  });
});

describe('blobEnvVarNames', () => {
  it('falls back to the BLOB prefix', () => {
    expect(blobEnvVarNames()).toEqual({
      readWriteToken: 'BLOB_READ_WRITE_TOKEN',
      storeId: 'BLOB_STORE_ID',
      webhookPublicKey: 'BLOB_WEBHOOK_PUBLIC_KEY',
    });
  });

  it('applies a custom prefix consistently across both name families', () => {
    expect(blobEnvVarNames('UPLOADS_')).toEqual({
      readWriteToken: 'UPLOADS_READ_WRITE_TOKEN',
      storeId: 'UPLOADS_STORE_ID',
      webhookPublicKey: 'UPLOADS_WEBHOOK_PUBLIC_KEY',
    });
  });
});

describe('parseAuthMode', () => {
  it('defaults to oidc and marks it as implicit', () => {
    expect(parseAuthMode(undefined)).toEqual({
      valid: true,
      mode: 'oidc',
      explicit: false,
    });
  });

  it('accepts either mode case-insensitively', () => {
    expect(parseAuthMode('TOKEN')).toEqual({
      valid: true,
      mode: 'token',
      explicit: true,
    });
  });

  it('rejects anything else', () => {
    const result = parseAuthMode('sso');
    expect(result.valid).toBe(false);
  });
});

describe('resolveStorageAuth', () => {
  it('never writes a static token without the explicit opt-in', () => {
    const result = resolveStorageAuth({
      store: blob,
      mode: 'token',
      addRwToken: false,
    });
    expect(result).toMatchObject({
      valid: false,
      reason: 'rw_token_opt_in_required',
    });
  });

  it('sends the OIDC opt-in header by default and no static token', () => {
    const auth = oidcAuth();
    expect(auth).toMatchObject({
      effective: 'oidc',
      useOidcHeader: true,
      readWriteToken: false,
    });
    expect(storageAuthHeaders(auth)).toEqual({ 'x-vercel-use-oidc': '1' });
  });

  it('adds the static token on top of OIDC when asked', () => {
    expect(oidcAuth(true)).toMatchObject({
      effective: 'oidc',
      readWriteToken: true,
    });
  });

  it('drops the OIDC header for --auth token --add-rw-token', () => {
    const result = resolveStorageAuth({
      store: blob,
      mode: 'token',
      addRwToken: true,
    });
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.auth).toMatchObject({
      effective: 'token',
      useOidcHeader: false,
      readWriteToken: true,
    });
    expect(storageAuthHeaders(result.auth)).toEqual({});
  });

  it('marks non-Blob resources as provider-managed', () => {
    const result = resolveStorageAuth({
      store: marketplace,
      mode: 'oidc',
      addRwToken: false,
    });
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.auth.effective).toEqual('provider-managed');
    expect(result.auth.readWriteToken).toBe(false);
    expect(result.auth.notes[0]).toContain('Acme');
  });

  it('rejects --add-rw-token for non-Blob resources', () => {
    expect(
      resolveStorageAuth({
        store: marketplace,
        mode: 'oidc',
        addRwToken: true,
      })
    ).toMatchObject({ valid: false, reason: 'unsupported_auth_mode' });
  });
});

describe('inferConnectionAuth', () => {
  it('reads the mode off the variable names for Blob', () => {
    expect(inferConnectionAuth(blob, ['BLOB_STORE_ID'])).toEqual('oidc');
    expect(inferConnectionAuth(blob, ['BLOB_READ_WRITE_TOKEN'])).toEqual(
      'token'
    );
    expect(
      inferConnectionAuth(blob, ['BLOB_STORE_ID', 'BLOB_READ_WRITE_TOKEN'])
    ).toEqual('oidc');
    expect(inferConnectionAuth(blob, [])).toEqual('unknown');
    expect(inferConnectionAuth(blob, undefined)).toEqual('unknown');
  });

  it('always reports provider-managed for other store types', () => {
    expect(inferConnectionAuth(marketplace, ['ACME_API_KEY'])).toEqual(
      'provider-managed'
    );
  });
});

describe('planConnectEnvVars', () => {
  it('computes exact Blob names', () => {
    expect(planConnectEnvVars({ store: blob, auth: oidcAuth() })).toEqual({
      add: ['BLOB_STORE_ID', 'BLOB_WEBHOOK_PUBLIC_KEY'],
      remove: [],
      keep: [],
      source: 'computed',
      notes: [],
    });
  });

  it('includes the static token when it was opted into', () => {
    expect(
      planConnectEnvVars({ store: blob, auth: oidcAuth(true) }).add
    ).toEqual([
      'BLOB_READ_WRITE_TOKEN',
      'BLOB_STORE_ID',
      'BLOB_WEBHOOK_PUBLIC_KEY',
    ]);
  });

  it('reports provider-named variables as unresolved', () => {
    const result = resolveStorageAuth({
      store: marketplace,
      mode: 'oidc',
      addRwToken: false,
    });
    if (!result.valid) throw new Error(result.error);

    const plan = planConnectEnvVars({
      store: marketplace,
      auth: result.auth,
    });
    expect(plan.source).toEqual('provider');
    expect(plan.add).toEqual([]);
  });

  it('previews provider names from a sibling connection with the same prefix', () => {
    const result = resolveStorageAuth({
      store: marketplace,
      mode: 'oidc',
      addRwToken: false,
    });
    if (!result.valid) throw new Error(result.error);

    const sibling = {
      id: 'spc_1',
      projectId: 'prj_other',
      name: 'other-project',
      environments: ['production'],
      envVarPrefix: null,
      environmentVariables: ['ACME_API_KEY'],
    };

    expect(
      planConnectEnvVars({ store: marketplace, auth: result.auth, sibling })
    ).toMatchObject({ add: ['ACME_API_KEY'], source: 'connection' });

    // A different prefix means different names, so the preview is not reusable.
    expect(
      planConnectEnvVars({
        store: marketplace,
        auth: result.auth,
        prefix: 'OTHER',
        sibling,
      })
    ).toMatchObject({ add: [], source: 'provider' });
  });
});

describe('planUpdateEnvVars', () => {
  const connection = {
    id: 'spc_1',
    projectId: 'prj_1',
    name: 'app',
    environments: ['production'],
    envVarPrefix: null,
    environmentVariables: ['BLOB_READ_WRITE_TOKEN'],
  };

  it('adds the OIDC variables and removes the static token', () => {
    expect(
      planUpdateEnvVars({
        store: blob,
        auth: oidcAuth(),
        connection,
        prefixChanged: false,
      })
    ).toMatchObject({
      add: ['BLOB_STORE_ID', 'BLOB_WEBHOOK_PUBLIC_KEY'],
      remove: ['BLOB_READ_WRITE_TOKEN'],
      keep: [],
    });
  });

  it('keeps OIDC variables in place when moving back to a static token', () => {
    const tokenAuth = resolveStorageAuth({
      store: blob,
      mode: 'token',
      addRwToken: true,
    });
    if (!tokenAuth.valid) throw new Error(tokenAuth.error);

    const plan = planUpdateEnvVars({
      store: blob,
      auth: tokenAuth.auth,
      connection: {
        ...connection,
        environmentVariables: ['BLOB_STORE_ID', 'BLOB_WEBHOOK_PUBLIC_KEY'],
      },
      prefixChanged: false,
    });
    expect(plan).toMatchObject({
      add: ['BLOB_READ_WRITE_TOKEN'],
      remove: [],
      keep: ['BLOB_STORE_ID', 'BLOB_WEBHOOK_PUBLIC_KEY'],
    });
    expect(plan.notes[0]).toContain('does not remove them');
  });

  it('re-scopes provider-managed variables without renaming them', () => {
    const result = resolveStorageAuth({
      store: marketplace,
      mode: 'oidc',
      addRwToken: false,
    });
    if (!result.valid) throw new Error(result.error);

    expect(
      planUpdateEnvVars({
        store: marketplace,
        auth: result.auth,
        connection: { ...connection, environmentVariables: ['ACME_API_KEY'] },
        prefixChanged: false,
      })
    ).toMatchObject({
      add: [],
      remove: [],
      keep: ['ACME_API_KEY'],
      source: 'connection',
    });
  });
});

describe('planDisconnectEnvVars', () => {
  it('removes every variable the connections own', () => {
    expect(
      planDisconnectEnvVars([
        {
          id: 'spc_1',
          projectId: 'prj_1',
          name: 'app',
          environments: ['production'],
          environmentVariables: ['BLOB_STORE_ID'],
        },
        {
          id: 'spc_2',
          projectId: 'prj_2',
          name: 'app-2',
          environments: ['preview'],
          environmentVariables: ['BLOB_READ_WRITE_TOKEN'],
        },
      ])
    ).toMatchObject({
      remove: ['BLOB_READ_WRITE_TOKEN', 'BLOB_STORE_ID'],
      source: 'connection',
    });
  });

  it('falls back to a note when the API reported no names', () => {
    const plan = planDisconnectEnvVars([
      {
        id: 'spc_1',
        projectId: 'prj_1',
        name: 'app',
        environments: ['production'],
      },
    ]);
    expect(plan.source).toEqual('provider');
    expect(plan.remove).toEqual([]);
  });
});

describe('diffEnvVarNames', () => {
  it('splits the before/after sets into add, remove, and keep', () => {
    expect(diffEnvVarNames(['A', 'B'], ['B', 'C'])).toEqual({
      add: ['C'],
      remove: ['A'],
      keep: ['B'],
      source: 'connection',
      notes: [],
    });
  });
});

describe('resolveStore', () => {
  const stores: StorageStore[] = [
    blob,
    marketplace,
    { id: 'store_dupe_a', name: 'dupe', type: 'blob' },
    { id: 'store_dupe_b', name: 'dupe', type: 'integration' },
    { id: 'store_named_like_id', name: 'store_blob', type: 'postgres' },
  ];

  it('resolves Blob and Marketplace resources through one identifier', () => {
    expect(resolveStore(stores, 'blobby')).toEqual({
      status: 'found',
      store: blob,
    });
    expect(resolveStore(stores, 'acme-db')).toEqual({
      status: 'found',
      store: marketplace,
    });
  });

  it('prefers an ID match over a store merely named after it', () => {
    expect(resolveStore(stores, 'store_blob')).toMatchObject({
      status: 'found',
      store: { id: 'store_blob' },
    });
  });

  it('reports ambiguity instead of guessing', () => {
    expect(resolveStore(stores, 'dupe')).toMatchObject({
      status: 'ambiguous',
    });
  });

  it('reports a miss', () => {
    expect(resolveStore(stores, 'nope')).toEqual({ status: 'not_found' });
  });
});

describe('store capabilities', () => {
  it('treats only Blob as OIDC-capable today', () => {
    expect(storeSupportsOidc(blob)).toBe(true);
    expect(storeSupportsOidc(marketplace)).toBe(false);
    expect(storeSupportsOidc({ id: 'x', name: 'x', type: 'postgres' })).toBe(
      false
    );
  });

  it('labels first-party and marketplace products', () => {
    expect(storeProductLabel(blob)).toEqual('Vercel Blob');
    expect(storeProductLabel(marketplace)).toEqual('Acme');
    expect(
      storeProductLabel({ id: 'x', name: 'x', type: 'edge-config' })
    ).toEqual('Vercel Global Config');
  });
});
