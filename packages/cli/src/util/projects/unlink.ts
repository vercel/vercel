import { join } from 'path';
import { pathExists, remove } from 'fs-extra';
import type Client from '../client';
import { VERCEL_DIR } from './link';
import { isErrnoException } from '@vercel/error-utils';

export interface UnlinkResult {
  success: boolean;
}

/**
 * Unlink a project by removing the .vercel directory
 */
export async function unlinkProject(
  client: Client,
  path: string
): Promise<UnlinkResult> {
  const vercelDirPath = join(path, VERCEL_DIR);

  try {
    // Check if .vercel directory exists
    if (!(await pathExists(vercelDirPath))) {
      return { success: false };
    }

    // Remove the .vercel directory
    await remove(vercelDirPath);

    return { success: true };
  } catch (err: unknown) {
    if (isErrnoException(err)) {
      // Handle specific error cases if needed
      throw err;
    }
    throw err;
  }
}
