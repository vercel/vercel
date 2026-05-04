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
 * also contains the subcommand and its own flags.
 */
function findFlagValue(argv: string[], flag: string): string | undefined {
  const eqPrefix = `${flag}=`;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === flag) return argv[i + 1];
    if (arg.startsWith(eqPrefix)) return arg.slice(eqPrefix.length);
  }
  return undefined;
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
  | { success: true; kind: 'oidc'; storeId: string }
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
    // Hoist onto process.env so the SDK's getVercelOidcToken() picks it up.
    process.env.VERCEL_OIDC_TOKEN = oidcTokenFlag;
    return { success: true, kind: 'oidc', storeId: storeIdFlag };
  }

  // 2. Env-derived auth: combine process.env with .env.local (process.env
  //    wins; .env.local fills gaps). Then resolve in this order:
  //      a. Hard-fail if OIDC config is partial — VERCEL_OIDC_TOKEN xor
  //         BLOB_STORE_ID. We never silently downgrade to RW when the user
  //         partially configured OIDC, mirroring the explicit-flags policy
  //         and AWS's credential-provider behavior.
  //      b. Both OIDC vars present → OIDC.
  //      c. BLOB_READ_WRITE_TOKEN present → RW.
  //      d. Otherwise → no-creds error.
  let envFile: Record<string, string | undefined> = {};
  try {
    envFile = (await createEnvObject(resolve(client.cwd, '.env.local'))) ?? {};
  } catch (_error) {
    // .env.local missing or unreadable — fine, treat as empty.
  }

  const oidcToken = process.env.VERCEL_OIDC_TOKEN ?? envFile.VERCEL_OIDC_TOKEN;
  const storeId = process.env.BLOB_STORE_ID ?? envFile.BLOB_STORE_ID;
  const rwTokenEnv =
    process.env.BLOB_READ_WRITE_TOKEN ?? envFile.BLOB_READ_WRITE_TOKEN;

  if (Boolean(oidcToken) !== Boolean(storeId)) {
    return { success: false, error: PartialOidcEnvErrorMessage };
  }

  if (oidcToken && storeId) {
    // Hoist onto process.env so the SDK's getVercelOidcToken() picks it up.
    process.env.VERCEL_OIDC_TOKEN ??= oidcToken;
    process.env.BLOB_STORE_ID ??= storeId;
    return { success: true, kind: 'oidc', storeId };
  }

  if (rwTokenEnv) {
    return { success: true, kind: 'rw', token: rwTokenEnv };
  }

  return { success: false, error: ErrorMessage };
}

/**
 * Build the auth-related option object for an `@vercel/blob` SDK call.
 *
 * For `rw` mode, returns `{ token }` — the SDK parses the store ID out of
 * the token and the server decodes it from the bearer.
 *
 * For `oidc` mode, returns `{ storeId }` and intentionally omits `token`.
 * The SDK's `options.token` is read-write only — if we passed the OIDC JWT
 * through it, the SDK would call `parseStoreIdFromReadWriteToken` (an
 * underscore split) on the JWT and produce a malformed store ID. Instead,
 * the SDK reads the OIDC token from `process.env.VERCEL_OIDC_TOKEN` via
 * `getVercelOidcToken()`. Our resolver hoists `.env.local` vars onto
 * `process.env` so that env-read works in local CLI runs too.
 */
export function blobOpts(auth: BlobRWToken): {
  token?: string;
  storeId?: string;
} {
  if (auth.success && auth.kind === 'rw') {
    return { token: auth.token };
  }
  if (auth.success && auth.kind === 'oidc') {
    return { storeId: auth.storeId };
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
