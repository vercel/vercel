import { resolve } from 'node:path';
import { createEnvObject } from '../env/diff-env-files';

import type Client from '../client';
import { getFlagsSpecification } from '../get-flags-specification';
import { blobCommand } from '../../commands/blob/command';
import { parseArguments } from '../get-args';
import { getCommandName, packageName } from '../pkg-name';
import cmd from '../output/cmd';
import listItem from '../output/list-item';

const ErrorMessage = `No Vercel Blob credentials found. To fix this issue, choose one of the following options:
${listItem(`Pass the token directly as an option: ${getCommandName('blob list --rw-token BLOB_READ_WRITE_TOKEN')}`, 1)}
${listItem(`Set OIDC credentials as environment variables: ${cmd(`VERCEL_OIDC_TOKEN=... BLOB_STORE_ID=... ${packageName} blob list`)}`, 2)}
${listItem(`Set the Token as an environment variable: ${cmd(`BLOB_READ_WRITE_TOKEN=BLOB_READ_WRITE_TOKEN ${packageName} blob list`)}`, 3)}
${listItem('Link your current folder to a Vercel Project that has a Vercel Blob store connected', 4)}`;

export type BlobRWToken =
  | { success: true; kind: 'rw'; token: string }
  | { success: true; kind: 'oidc'; storeId: string }
  | { error: string; success: false };

export async function getBlobRWToken(
  client: Client,
  argv: string[]
): Promise<BlobRWToken> {
  const flagsSpecification = getFlagsSpecification(blobCommand.options);

  // 1. --rw-token flag is exclusive: if present, never fall back to OIDC.
  try {
    const parsedArgs = parseArguments(argv, flagsSpecification);
    const {
      flags: { '--rw-token': rwToken },
    } = parsedArgs;

    if (rwToken) {
      return { success: true, kind: 'rw', token: rwToken };
    }
  } catch (_err) {
    // continue with token hierarchy
  }

  // 2. OIDC from process.env (default when both vars are present).
  if (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID) {
    return {
      success: true,
      kind: 'oidc',
      storeId: process.env.BLOB_STORE_ID,
    };
  }

  // 3. BLOB_READ_WRITE_TOKEN from process.env.
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return {
      success: true,
      kind: 'rw',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    };
  }

  // 4 & 5. Fall back to .env.local — OIDC pair first, then RW token.
  const filename = '.env.local';
  const fullPath = resolve(client.cwd, filename);

  try {
    const env = await createEnvObject(fullPath);

    if (env?.VERCEL_OIDC_TOKEN && env?.BLOB_STORE_ID) {
      // Hoist to process.env so the SDK's env-read picks them up.
      process.env.VERCEL_OIDC_TOKEN ??= env.VERCEL_OIDC_TOKEN;
      process.env.BLOB_STORE_ID ??= env.BLOB_STORE_ID;
      return { success: true, kind: 'oidc', storeId: env.BLOB_STORE_ID };
    }

    if (env?.BLOB_READ_WRITE_TOKEN) {
      return {
        success: true,
        kind: 'rw',
        token: env.BLOB_READ_WRITE_TOKEN,
      };
    }
  } catch (_error) {
    // continue with token hierarchy
  }

  return {
    error: ErrorMessage,
    success: false,
  };
}

/**
 * Build the auth-related option object for an `@vercel/blob` SDK call.
 * For `rw` mode, returns `{ token }`. For `oidc` mode, returns `{}` —
 * the SDK reads `VERCEL_OIDC_TOKEN` + `BLOB_STORE_ID` from `process.env`.
 */
export function blobOpts(auth: BlobRWToken): { token?: string } {
  if (auth.success && auth.kind === 'rw') {
    return { token: auth.token };
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
