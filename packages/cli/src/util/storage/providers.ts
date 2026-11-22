import type { CommandOption } from '../../commands/help';
import type Client from '../client';
import type { JSONObject } from '@vercel-internals/types';
import { getStorageStore, type StorageStore } from './store';

/**
 * Everything the generic `vercel storage` lifecycle subcommands (`create`,
 * `get`, `delete`) need to know about one store type.
 *
 * Listing, resolving, and connecting stores already go through the
 * provider-neutral `/v1/storage/stores` surface. Creating and deleting a store
 * do not — every product has its own endpoint and its own required inputs —
 * so those live here, one entry per store type. Adding support for another
 * product means adding one `StorageProvider` to `STORAGE_PROVIDERS`; the
 * subcommands, `--type` parsing, help output, and telemetry pick it up.
 */
export interface StorageProvider {
  /** Canonical `--type` value and the `type` the CLI reports, e.g. `blob`. */
  readonly type: string;
  /**
   * Every `type` value `/v1/storage/stores` may report for this product. The
   * API and the CLI do not always agree on a name (Edge Config was renamed to
   * Global Config), so matching a store to its provider goes through this.
   */
  readonly apiTypes: readonly string[];
  /** Human-readable product name, e.g. `Vercel Blob`. */
  readonly label: string;
  /** Extra spellings accepted by `--type`, e.g. `edge-config`. */
  readonly typeAliases: readonly string[];
  /** Provider-specific `create` flags, merged into the subcommand's options. */
  readonly createOptions: readonly CommandOption[];
  /**
   * Validates the provider-specific `create` flags. `prompt` is only set
   * when the CLI may ask the user for missing values.
   */
  validateCreate(
    flags: CreateFlags,
    context: { prompt?: PromptFns }
  ): Promise<ValidateCreateResult>;
  /** Creates the store. `params` is whatever `validateCreate` returned. */
  create(
    client: Client,
    input: { name: string; params: JSONObject; accountId?: string }
  ): Promise<CreatedStore>;
  /** Deletes the store, including whatever cleanup the product needs first. */
  delete(
    client: Client,
    input: { store: StorageStore; accountId?: string }
  ): Promise<void>;
  /**
   * Product-specific details for `get`. Keys become `details.<key>` in JSON
   * output and one labeled line each in text output.
   */
  describe(
    client: Client,
    input: { store: StorageStore; accountId?: string }
  ): Promise<Record<string, string | number | boolean | null>>;
}

export type CreateFlags = Record<string, string | boolean | undefined>;

export interface PromptFns {
  select<T extends string>(
    message: string,
    choices: Array<{ name: string; value: T; description?: string }>
  ): Promise<T>;
}

export type ValidateCreateResult =
  | { valid: true; params: JSONObject }
  | {
      valid: false;
      reason: 'missing_arguments' | 'invalid_arguments';
      message: string;
    };

export interface CreatedStore {
  id: string;
  name: string;
  /** Anything worth echoing back, e.g. the region a Blob store landed in. */
  details: Record<string, string | number | boolean | null>;
}

/**
 * Drops every project connection so the connections' environment variables
 * are removed before the store disappears. Provider-neutral endpoint.
 */
async function disconnectStoreProjects(
  client: Client,
  store: StorageStore,
  accountId: string | undefined
): Promise<void> {
  await client.fetch(
    `/v1/storage/stores/${encodeURIComponent(store.id)}/connections`,
    { method: 'DELETE', accountId }
  );
}

// ---------------------------------------------------------------------------
// Vercel Blob
// ---------------------------------------------------------------------------

export const blobAccessOption = {
  name: 'access',
  shorthand: null,
  type: String,
  argument: 'ACCESS',
  deprecated: false,
  description:
    'Blob only: access level for the store, `public` or `private` (required)',
} as const;

export const blobRegionOption = {
  name: 'region',
  shorthand: null,
  type: String,
  argument: 'REGION',
  deprecated: false,
  description: 'Blob only: region to create the store in (default: iad1)',
} as const;

const BLOB_ACCESS_VALUES = ['public', 'private'] as const;
type BlobAccess = (typeof BLOB_ACCESS_VALUES)[number];

function isBlobAccess(value: unknown): value is BlobAccess {
  return (
    typeof value === 'string' &&
    (BLOB_ACCESS_VALUES as readonly string[]).includes(value)
  );
}

const blobProvider: StorageProvider = {
  type: 'blob',
  apiTypes: ['blob'],
  label: 'Vercel Blob',
  typeAliases: [],
  createOptions: [blobAccessOption, blobRegionOption],

  async validateCreate(flags, { prompt }) {
    let access = flags['--access'];
    if (access === undefined && prompt) {
      access = await prompt.select<BlobAccess>(
        'Choose the access type for the blob store',
        [
          {
            name: 'Private',
            value: 'private',
            description:
              'For sensitive documents, user content, and apps with custom auth',
          },
          {
            name: 'Public',
            value: 'public',
            description: 'For images, videos, large media, and public assets',
          },
        ]
      );
    }
    if (access === undefined) {
      return {
        valid: false,
        reason: 'missing_arguments',
        message:
          'Blob stores require --access. Pass --access public or --access private.',
      };
    }
    if (!isBlobAccess(access)) {
      return {
        valid: false,
        reason: 'invalid_arguments',
        message: `Invalid --access value "${String(access)}". Must be public or private.`,
      };
    }
    const region = flags['--region'];
    if (region !== undefined && typeof region !== 'string') {
      return {
        valid: false,
        reason: 'invalid_arguments',
        message: '--region must be a region id such as iad1.',
      };
    }
    return { valid: true, params: { access, region: region ?? 'iad1' } };
  },

  async create(client, { name, params, accountId }) {
    const response = await client.fetch<{
      store: { id: string; name?: string; region?: string; access?: string };
    }>('/v1/storage/stores/blob', {
      method: 'POST',
      body: { name, ...params },
      accountId,
    });
    return {
      id: response.store.id,
      name: response.store.name ?? name,
      details: {
        region: response.store.region ?? (params.region as string) ?? null,
        access: response.store.access ?? (params.access as string) ?? null,
      },
    };
  },

  async delete(client, { store, accountId }) {
    await disconnectStoreProjects(client, store, accountId);
    await client.fetch(
      `/v1/storage/stores/blob/${encodeURIComponent(store.id)}`,
      { method: 'DELETE', accountId }
    );
  },

  async describe(_client, { store }) {
    const raw = store as StorageStore & {
      region?: string;
      access?: string;
      size?: number;
      count?: number;
      billingState?: string;
    };
    const suffix = store.id.replace(/^store_/, '').toLowerCase();
    const access = raw.access === 'private' ? 'private' : 'public';
    return {
      region: raw.region ?? null,
      access,
      size: raw.size ?? null,
      count: raw.count ?? null,
      billingState: raw.billingState ?? null,
      baseUrl: `${suffix}.${access}.blob.vercel-storage.com`,
    };
  },
};

// ---------------------------------------------------------------------------
// Vercel Global Config (formerly Edge Config)
// ---------------------------------------------------------------------------

export const edgeConfigItemsOption = {
  name: 'items',
  shorthand: null,
  type: String,
  argument: 'JSON',
  deprecated: false,
  description:
    'Global Config only: initial items as a JSON object of key → value pairs',
} as const;

const globalConfigProvider: StorageProvider = {
  type: 'global-config',
  apiTypes: ['global-config', 'edge-config'],
  label: 'Vercel Global Config',
  typeAliases: ['edge-config', 'edgeconfig'],
  createOptions: [edgeConfigItemsOption],

  async validateCreate(flags) {
    const items = flags['--items'];
    if (items === undefined) {
      return { valid: true, params: {} };
    }
    if (typeof items !== 'string') {
      return {
        valid: false,
        reason: 'invalid_arguments',
        message: '--items must be a JSON object of key → value pairs.',
      };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(items);
    } catch {
      return {
        valid: false,
        reason: 'invalid_arguments',
        message: '--items must be valid JSON.',
      };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        valid: false,
        reason: 'invalid_arguments',
        message: '--items must be a JSON object of key → value pairs.',
      };
    }
    return { valid: true, params: { items: parsed as JSONObject } };
  },

  async create(client, { name, params, accountId }) {
    const response = await client.fetch<{
      id: string;
      slug?: string;
      itemCount?: number;
    }>('/v1/global-config', {
      method: 'POST',
      body: { slug: name, ...params },
      accountId,
    });
    return {
      id: response.id,
      name: response.slug ?? name,
      details: { itemCount: response.itemCount ?? null },
    };
  },

  async delete(client, { store, accountId }) {
    // The API refuses to delete a Global Config a project still uses.
    await disconnectStoreProjects(client, store, accountId);
    await client.fetch(`/v1/global-config/${encodeURIComponent(store.id)}`, {
      method: 'DELETE',
      accountId,
    });
  },

  async describe(client, { store, accountId }) {
    const config = await client.fetch<{
      slug?: string;
      itemCount?: number;
      sizeInBytes?: number;
      digest?: string;
    }>(`/v1/global-config/${encodeURIComponent(store.id)}`, { accountId });
    return {
      slug: config.slug ?? store.name,
      itemCount: config.itemCount ?? null,
      sizeInBytes: config.sizeInBytes ?? null,
      digest: config.digest ?? null,
    };
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const STORAGE_PROVIDERS: readonly StorageProvider[] = [
  blobProvider,
  globalConfigProvider,
];

/** Every `--type` value the CLI accepts, canonical names first. */
export function listStorageProviderTypes(): string[] {
  return STORAGE_PROVIDERS.map(provider => provider.type);
}

/** Resolves a `--type` value or a store's `type` field to its provider. */
export function getStorageProvider(
  type: string | undefined
): StorageProvider | undefined {
  if (!type) {
    return undefined;
  }
  const normalized = type.toLowerCase();
  return STORAGE_PROVIDERS.find(
    provider =>
      provider.type === normalized ||
      provider.typeAliases.includes(normalized) ||
      provider.apiTypes.includes(normalized)
  );
}

/**
 * The type name the CLI shows for a store: the provider's canonical `--type`
 * value when one is registered, otherwise whatever the API reported.
 */
export function storeTypeName(store: StorageStore): string {
  const apiType = store.type ?? 'unknown';
  return getStorageProvider(apiType)?.type ?? apiType;
}

/**
 * True when a store matches a `--type` filter. Known types match through the
 * provider (so `--type edge-config` still finds Global Config stores); unknown
 * types such as Marketplace `integration` compare against the raw API type.
 */
export function storeMatchesType(store: StorageStore, type: string): boolean {
  const provider = getStorageProvider(type);
  if (provider) {
    return provider.apiTypes.includes(store.type ?? '');
  }
  return (store.type ?? 'unknown') === type.toLowerCase();
}

/** The provider-specific `create` flags of every provider, in registry order. */
export function getProviderCreateOptions(): readonly CommandOption[] {
  return STORAGE_PROVIDERS.flatMap(provider => provider.createOptions);
}

/**
 * Names of provider-specific flags that were passed but belong to a different
 * provider than the one being created, e.g. `--access` on an Edge Config.
 */
export function findForeignCreateFlags(
  provider: StorageProvider,
  flags: CreateFlags
): string[] {
  const own = new Set(provider.createOptions.map(option => `--${option.name}`));
  return getProviderCreateOptions()
    .map(option => `--${option.name}`)
    .filter(flag => !own.has(flag) && flags[flag] !== undefined);
}

/**
 * Re-reads a store so `get` and `delete` report the product-specific fields
 * that the list endpoint omits (size, region, connections, …).
 */
export async function loadStoreDetails(
  client: Client,
  store: StorageStore,
  accountId: string | undefined
): Promise<StorageStore> {
  return getStorageStore(client, store.id, { accountId });
}
