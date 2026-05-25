import { resolve } from 'node:path';
import { createEnvObject } from '../env/diff-env-files';

import type Client from '../client';
import { getCommandName, packageName } from '../pkg-name';
import cmd from '../output/cmd';
import listItem from '../output/list-item';

/**
 * Linear scan for a specific named flag's value. Supports both
 * `--flag value` and `--flag=value` forms. Used to read the few auth
 * flags here without re-running the full arg parser over an argv that
 * also contains the subcommand and its own flags. If the flag is
 * repeated, the last occurrence wins — matching standard CLI parser
 * semantics.
 */
export function findFlagValue(
  argv: string[],
  flag: string
): string | undefined {
  const eqPrefix = `${flag}=`;
  let result: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === flag) result = argv[i + 1];
    else if (arg.startsWith(eqPrefix)) result = arg.slice(eqPrefix.length);
  }
  return result;
}

const ErrorMessage = `No Vercel Blob credentials found. To fix this issue, choose one of the following options:
${listItem(`Pass the read-write token as an option: ${getCommandName('blob list --rw-token BLOB_READ_WRITE_TOKEN')}`, 1)}
${listItem(`Pass OIDC credentials as options: ${getCommandName('blob list --oidc-token VERCEL_OIDC_TOKEN --store-id BLOB_STORE_ID')}`, 2)}
${listItem(`Set OIDC credentials as environment variables: ${cmd(`VERCEL_OIDC_TOKEN=... BLOB_STORE_ID=... ${packageName} blob list`)}`, 3)}
${listItem(`Set the read-write token as an environment variable: ${cmd(`BLOB_READ_WRITE_TOKEN=BLOB_READ_WRITE_TOKEN ${packageName} blob list`)}`, 4)}
${listItem('Link your current folder to a Vercel Project that has a Vercel Blob store connected', 5)}`;

const PartialOidcFlagsErrorMessage = `--oidc-token and --store-id must be passed together. Pass both flags, or omit them and rely on environment variables / linked project credentials.`;

const PartialOidcEnvErrorMessage = `VERCEL_OIDC_TOKEN and BLOB_STORE_ID must both be set, or both be unset. Set both to use OIDC, unset both to use the read-write token, or pass --rw-token / --oidc-token + --store-id explicitly.`;

export type BlobRWToken =
  | { success: true; kind: 'rw'; token: string }
  | { success: true; kind: 'oidc'; oidcToken: string; storeId: string }
  | { error: string; success: false };

export async function getBlobRWToken(
  client: Client,
  argv: string[]
): Promise<BlobRWToken> {
  // 1. Explicit auth flags are exclusive. Try --rw-token first, then the
  //    --oidc-token + --store-id pair. If either OIDC flag is passed alone,
  //    surface a hard error rather than silently falling through.
  const rwToken = findFlagValue(argv, '--rw-token');
  if (rwToken) {
    return { success: true, kind: 'rw', token: rwToken };
  }

  const oidcTokenFlag = findFlagValue(argv, '--oidc-token');
  const storeIdFlag = findFlagValue(argv, '--store-id');
  if (oidcTokenFlag || storeIdFlag) {
    if (!oidcTokenFlag || !storeIdFlag) {
      return { success: false, error: PartialOidcFlagsErrorMessage };
    }
    return {
      success: true,
      kind: 'oidc',
      oidcToken: oidcTokenFlag,
      storeId: storeIdFlag,
    };
  }

  // 2. Env-derived auth. Resolve from `process.env` first; only consult
  //    `.env.local` if `process.env` doesn't already provide a complete
  //    credential set. Within each source the priority is:
  //      a. Hard-fail if OIDC config is partial — VERCEL_OIDC_TOKEN xor
  //         BLOB_STORE_ID. We never silently downgrade to RW when the user
  //         partially configured OIDC, mirroring the explicit-flags policy
  //         and AWS's credential-provider behavior.
  //      b. Both OIDC vars present → OIDC.
  //      c. BLOB_READ_WRITE_TOKEN present → RW.
  //      d. Otherwise → fall through to the next source.
  const fromProcess = resolveFromEnv({
    VERCEL_OIDC_TOKEN: process.env.VERCEL_OIDC_TOKEN,
    BLOB_STORE_ID: process.env.BLOB_STORE_ID,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
  });
  if (fromProcess) return fromProcess;

  let envFile: Record<string, string | undefined> = {};
  try {
    envFile = (await createEnvObject(resolve(client.cwd, '.env.local'))) ?? {};
  } catch (_error) {
    // .env.local missing or unreadable — fine, treat as empty.
  }

  const fromFile = resolveFromEnv({
    VERCEL_OIDC_TOKEN: envFile.VERCEL_OIDC_TOKEN,
    BLOB_STORE_ID: envFile.BLOB_STORE_ID,
    BLOB_READ_WRITE_TOKEN: envFile.BLOB_READ_WRITE_TOKEN,
  });
  if (fromFile) return fromFile;

  return { success: false, error: ErrorMessage };
}

/**
 * Resolve a `BlobRWToken` from a single env source. Returns `null` when
 * the source has no relevant variables (caller should fall through to
 * the next source) and an error result when only one OIDC half is set.
 */
function resolveFromEnv(env: {
  VERCEL_OIDC_TOKEN: string | undefined;
  BLOB_STORE_ID: string | undefined;
  BLOB_READ_WRITE_TOKEN: string | undefined;
}): BlobRWToken | null {
  const { VERCEL_OIDC_TOKEN, BLOB_STORE_ID, BLOB_READ_WRITE_TOKEN } = env;

  if (Boolean(VERCEL_OIDC_TOKEN) !== Boolean(BLOB_STORE_ID)) {
    return { success: false, error: PartialOidcEnvErrorMessage };
  }

  if (VERCEL_OIDC_TOKEN && BLOB_STORE_ID) {
    return {
      success: true,
      kind: 'oidc',
      oidcToken: VERCEL_OIDC_TOKEN,
      storeId: BLOB_STORE_ID,
    };
  }

  if (BLOB_READ_WRITE_TOKEN) {
    return { success: true, kind: 'rw', token: BLOB_READ_WRITE_TOKEN };
  }

  return null;
}

/**
 * Build the auth-related option object for an `@vercel/blob` SDK call.
 *
 * For `rw` mode, returns `{ token }` — the SDK parses the store ID out of
 * the token and the server decodes it from the bearer.
 *
 * For `oidc` mode, returns `{ oidcToken, storeId }`. The SDK (>=2.4.0)
 * accepts the OIDC JWT directly via `options.oidcToken` and uses `storeId`
 * to scope the call. We intentionally omit `token` — passing the OIDC JWT
 * there would route through `parseStoreIdFromReadWriteToken` and produce
 * a malformed store ID.
 */
export function blobOpts(auth: BlobRWToken): {
  token?: string;
  oidcToken?: string;
  storeId?: string;
} {
  if (auth.success && auth.kind === 'rw') {
    return { token: auth.token };
  }
  if (auth.success && auth.kind === 'oidc') {
    return { oidcToken: auth.oidcToken, storeId: auth.storeId };
  }
  return {};
}

/**
 * Resolve a store ID (`store_<id>`) from either auth mode.
 * Returns `null` for an unsuccessful auth or when the RW token is malformed.
 */
export function getStoreIdFromAuth(auth: BlobRWToken): string | null {
  if (!auth.success) return null;

  if (auth.kind === 'oidc') {
    return auth.storeId.startsWith('store_')
      ? auth.storeId
      : `store_${auth.storeId}`;
  }

  const [, , , id] = auth.token.split('_');
  return id ? `store_${id}` : null;
}
