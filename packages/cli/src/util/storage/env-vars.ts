import type { ResolvedStorageAuth } from './auth';
import {
  storeProductLabel,
  storeSupportsOidc,
  type StorageConnection,
  type StorageStore,
} from './store';

/** `--prefix` accepts the same shape as `integration resource connect`. */
export const ENV_VAR_PREFIX_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;

/**
 * Canonical form of a user-supplied prefix: no trailing underscore.
 *
 * The API appends the separator itself for token-set variables
 * (`ACME` → `ACME_DATABASE_URL`) but interpolates the prefix directly for the
 * Blob OIDC variables (`` `${prefix}_STORE_ID` ``). Sending the canonical form
 * keeps both families consistent instead of producing `ACME__STORE_ID`.
 */
export function normalizeEnvVarPrefix(
  prefix: string | undefined | null
): string | undefined {
  if (prefix === undefined || prefix === null) {
    return undefined;
  }
  const canonical = prefix.replace(/_+$/, '');
  return canonical.length > 0 ? canonical : undefined;
}

/** Default prefix the API falls back to for Blob stores. */
const BLOB_DEFAULT_PREFIX = 'BLOB';

export interface BlobEnvVarNames {
  readWriteToken: string;
  storeId: string;
  webhookPublicKey: string;
}

export function blobEnvVarNames(prefix?: string): BlobEnvVarNames {
  const base = normalizeEnvVarPrefix(prefix) ?? BLOB_DEFAULT_PREFIX;
  return {
    readWriteToken: `${base}_READ_WRITE_TOKEN`,
    storeId: `${base}_STORE_ID`,
    webhookPublicKey: `${base}_WEBHOOK_PUBLIC_KEY`,
  };
}

/**
 * Where the names in a plan came from.
 *
 * - `computed` — derived from the store type, prefix, and credential mode. Exact.
 * - `connection` — read back from a connection the API already created. Exact.
 * - `provider` — the resource's provider names its own variables, so they can
 *   only be reported after the mutation lands.
 */
export type EnvVarNameSource = 'computed' | 'connection' | 'provider';

export interface EnvVarChangePlan {
  add: string[];
  remove: string[];
  keep: string[];
  source: EnvVarNameSource;
  notes: string[];
}

function emptyPlan(source: EnvVarNameSource): EnvVarChangePlan {
  return { add: [], remove: [], keep: [], source, notes: [] };
}

function sorted(names: Iterable<string>): string[] {
  return [...new Set(names)].sort();
}

function difference(a: string[], b: string[]): string[] {
  const exclude = new Set(b);
  return sorted(a.filter(name => !exclude.has(name)));
}

function intersection(a: string[], b: string[]): string[] {
  const include = new Set(b);
  return sorted(a.filter(name => include.has(name)));
}

/** Names a Blob connection should own for a given credential mode. */
function desiredBlobNames({
  auth,
  prefix,
  hasOidcVars,
}: {
  auth: ResolvedStorageAuth;
  prefix?: string;
  hasOidcVars: boolean;
}): string[] {
  const names = blobEnvVarNames(prefix);
  const desired: string[] = [];
  // The API's OIDC path is additive: once a connection owns a STORE_ID it keeps
  // it, so a connection that already has the OIDC variables keeps them even
  // when the caller asks for static credentials.
  if (auth.effective === 'oidc' || hasOidcVars) {
    desired.push(names.storeId, names.webhookPublicKey);
  }
  if (auth.readWriteToken) {
    desired.push(names.readWriteToken);
  }
  return sorted(desired);
}

/**
 * Env var changes a fresh connection will make.
 *
 * `sibling` is another connection to the same store that already has resolved
 * names. For Marketplace resources it is the only way to preview names before
 * the connection exists, and it is only usable when the prefix matches.
 */
export function planConnectEnvVars({
  store,
  auth,
  prefix,
  sibling,
}: {
  store: StorageStore;
  auth: ResolvedStorageAuth;
  prefix?: string;
  sibling?: StorageConnection;
}): EnvVarChangePlan {
  if (storeSupportsOidc(store)) {
    return {
      add: desiredBlobNames({ auth, prefix, hasOidcVars: false }),
      remove: [],
      keep: [],
      source: 'computed',
      notes: [],
    };
  }

  const siblingPrefixMatches =
    sibling !== undefined &&
    normalizeEnvVarPrefix(sibling.envVarPrefix) ===
      normalizeEnvVarPrefix(prefix);

  if (
    siblingPrefixMatches &&
    sibling?.environmentVariables &&
    sibling.environmentVariables.length > 0
  ) {
    return {
      add: sorted(sibling.environmentVariables),
      remove: [],
      keep: [],
      source: 'connection',
      notes: [
        `Names mirror this store's existing connection to ${sibling.name}.`,
      ],
    };
  }

  return {
    ...emptyPlan('provider'),
    notes: [
      `${storeProductLabel(store)} names the variables for this resource. The exact list is reported once the connection is created.`,
    ],
  };
}

/** Env var changes an update to an existing connection will make. */
export function planUpdateEnvVars({
  store,
  auth,
  prefix,
  connection,
  prefixChanged,
}: {
  store: StorageStore;
  auth: ResolvedStorageAuth;
  prefix?: string;
  connection: StorageConnection;
  prefixChanged: boolean;
}): EnvVarChangePlan {
  const current = sorted(connection.environmentVariables ?? []);

  if (storeSupportsOidc(store)) {
    const hasOidcVars = current.some(name => name.endsWith('_STORE_ID'));
    const desired = desiredBlobNames({ auth, prefix, hasOidcVars });
    const plan: EnvVarChangePlan = {
      add: difference(desired, current),
      remove: difference(current, desired),
      keep: intersection(current, desired),
      source: 'computed',
      notes: [],
    };
    if (hasOidcVars && auth.effective === 'token') {
      plan.notes.push(
        'The OIDC variables stay in place — Vercel does not remove them once a connection has been upgraded.'
      );
    }
    return plan;
  }

  if (!current.length) {
    return {
      ...emptyPlan('provider'),
      notes: [
        `${storeProductLabel(store)} names the variables for this resource. The exact list is reported once the update is applied.`,
      ],
    };
  }

  if (prefixChanged) {
    return {
      add: [],
      remove: current,
      keep: [],
      source: 'provider',
      notes: [
        `${storeProductLabel(store)} names the variables for this resource, so the re-prefixed names are reported once the update is applied.`,
      ],
    };
  }

  return {
    add: [],
    remove: [],
    keep: current,
    source: 'connection',
    notes: ['The variables are re-scoped, not renamed.'],
  };
}

/**
 * Exact change set between the names a connection owned before a mutation and
 * the names it owns after. Used to report the outcome once the API has resolved
 * provider-chosen names.
 */
export function diffEnvVarNames(
  before: string[],
  after: string[]
): EnvVarChangePlan {
  return {
    add: difference(after, before),
    remove: difference(before, after),
    keep: intersection(before, after),
    source: 'connection',
    notes: [],
  };
}

/** Env vars a disconnect will remove. */
export function planDisconnectEnvVars(
  connections: StorageConnection[]
): EnvVarChangePlan {
  const known = connections.flatMap(
    connection => connection.environmentVariables ?? []
  );
  const anyUnknown = connections.some(
    connection => connection.environmentVariables === undefined
  );

  if (!known.length && anyUnknown) {
    return {
      ...emptyPlan('provider'),
      notes: [
        'Vercel did not report the variable names for this connection; every variable it owns is removed.',
      ],
    };
  }

  return {
    add: [],
    remove: sorted(known),
    keep: [],
    source: 'connection',
    notes: [],
  };
}
