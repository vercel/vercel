import {
  storeProductLabel,
  storeSupportsOidc,
  type StorageStore,
} from './store';

export const STORAGE_AUTH_MODES = ['oidc', 'token'] as const;
export type StorageAuthMode = (typeof STORAGE_AUTH_MODES)[number];

/** The default is OIDC — short-lived credentials, no long-lived secret. */
export const DEFAULT_STORAGE_AUTH_MODE: StorageAuthMode = 'oidc';

/**
 * What the CLI will actually ask the API for.
 *
 * - `oidc` — the store issues credentials through Vercel OIDC. Requires the
 *   `x-vercel-use-oidc: 1` request header, which is why this is a first-class,
 *   documented flag instead of a header users have to discover.
 * - `token` — long-lived static credentials only.
 * - `provider-managed` — the resource's provider issues its own credentials and
 *   Vercel OIDC does not apply (every Marketplace and non-Blob 1P resource
 *   today). The surface stays uniform; only the capability differs.
 */
export type EffectiveStorageAuth = 'oidc' | 'token' | 'provider-managed';

export interface ResolvedStorageAuth {
  /** What the user asked for (explicitly or by default). */
  requested: StorageAuthMode;
  effective: EffectiveStorageAuth;
  /** Whether to send `x-vercel-use-oidc: 1`. */
  useOidcHeader: boolean;
  /** Whether the static read-write token env var should be written. */
  readWriteToken: boolean;
  /** Non-fatal notes to surface next to the plan. */
  notes: string[];
}

export type ParseAuthModeResult =
  | { valid: true; mode: StorageAuthMode; explicit: boolean }
  | { valid: false; error: string };

export function parseAuthMode(value: string | undefined): ParseAuthModeResult {
  if (value === undefined) {
    return { valid: true, mode: DEFAULT_STORAGE_AUTH_MODE, explicit: false };
  }
  const normalized = value.toLowerCase();
  if ((STORAGE_AUTH_MODES as readonly string[]).includes(normalized)) {
    return { valid: true, mode: normalized as StorageAuthMode, explicit: true };
  }
  return {
    valid: false,
    error: `Invalid --auth value: "${value}". Must be one of: ${STORAGE_AUTH_MODES.join(', ')}.`,
  };
}

export type ResolveAuthResult =
  | { valid: true; auth: ResolvedStorageAuth }
  | { valid: false; reason: string; error: string; hint?: string };

/**
 * Combines the requested mode with what the store can actually do.
 *
 * Static credentials are never implicit: `--auth token` on a store that has a
 * read-write token is rejected unless `--add-rw-token` is also passed, so no
 * invocation writes a long-lived secret that the command line does not name.
 */
export function resolveStorageAuth({
  store,
  mode,
  addRwToken,
}: {
  store: StorageStore;
  mode: StorageAuthMode;
  addRwToken: boolean;
}): ResolveAuthResult {
  const product = storeProductLabel(store);

  if (!storeSupportsOidc(store)) {
    if (addRwToken) {
      return {
        valid: false,
        reason: 'unsupported_auth_mode',
        error: `--add-rw-token only applies to Vercel Blob stores. ${store.name} is a ${product} resource, and its credentials are issued by the provider.`,
        hint: 'Re-run without --add-rw-token.',
      };
    }
    return {
      valid: true,
      auth: {
        requested: mode,
        effective: 'provider-managed',
        // Harmless for non-Blob stores today and forward-compatible once more
        // products gain OIDC support; the plan output states it either way.
        useOidcHeader: mode === 'oidc',
        readWriteToken: false,
        notes: [
          `${product} issues its own credentials for this resource; Vercel OIDC does not apply.`,
        ],
      },
    };
  }

  if (mode === 'token' && !addRwToken) {
    return {
      valid: false,
      reason: 'rw_token_opt_in_required',
      error:
        '--auth token writes a long-lived read-write token into your project.',
      hint: 'Pass --add-rw-token to confirm, or drop --auth token to use the OIDC default.',
    };
  }

  if (mode === 'token') {
    return {
      valid: true,
      auth: {
        requested: mode,
        effective: 'token',
        useOidcHeader: false,
        readWriteToken: true,
        notes: [],
      },
    };
  }

  return {
    valid: true,
    auth: {
      requested: mode,
      effective: 'oidc',
      useOidcHeader: true,
      readWriteToken: addRwToken,
      notes: addRwToken
        ? [
            'The static read-write token is written alongside the OIDC variables because --add-rw-token was passed.',
          ]
        : [],
    },
  };
}

/** Request headers for a mutation that opts in to the OIDC credential path. */
export function storageAuthHeaders(
  auth: ResolvedStorageAuth
): Record<string, string> {
  return auth.useOidcHeader ? { 'x-vercel-use-oidc': '1' } : {};
}

export function describeStorageAuth(auth: {
  effective: EffectiveStorageAuth;
  readWriteToken: boolean;
}): string {
  switch (auth.effective) {
    case 'oidc':
      return auth.readWriteToken
        ? 'oidc + static read-write token'
        : 'oidc (no static credentials)';
    case 'token':
      return 'static read-write token';
    case 'provider-managed':
      return 'provider-managed credentials';
  }
}

/**
 * The credential mode an existing connection is already using, inferred from
 * the env var names it owns. Blob is the only store type where the names are
 * meaningful; everything else is provider-managed.
 */
export function inferConnectionAuth(
  store: StorageStore,
  environmentVariables: string[] | undefined
): EffectiveStorageAuth | 'unknown' {
  if (!storeSupportsOidc(store)) {
    return 'provider-managed';
  }
  if (!environmentVariables) {
    return 'unknown';
  }
  const hasStoreId = environmentVariables.some(name =>
    name.endsWith('_STORE_ID')
  );
  const hasRwToken = environmentVariables.some(name =>
    name.endsWith('_READ_WRITE_TOKEN')
  );
  if (hasStoreId) {
    return 'oidc';
  }
  if (hasRwToken) {
    return 'token';
  }
  return 'unknown';
}
