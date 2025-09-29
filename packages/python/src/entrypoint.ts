import fs from 'fs';
import { posix as pathPosix } from 'path';
import type { FileFsRef } from '@vercel/build-utils';
import { glob, debug } from '@vercel/build-utils';

export const FASTAPI_ENTRYPOINT_FILENAMES = ['app', 'index', 'server', 'main'];
export const FASTAPI_ENTRYPOINT_DIRS = ['', 'src', 'app'];
export const FASTAPI_CONTENT_REGEX =
  /(from\s+fastapi\s+import\s+FastAPI|import\s+fastapi|FastAPI\s*\()/;

export const FASTAPI_CANDIDATE_ENTRYPOINTS =
  FASTAPI_ENTRYPOINT_FILENAMES.flatMap((filename: string) =>
    FASTAPI_ENTRYPOINT_DIRS.map((dir: string) =>
      pathPosix.join(dir, `${filename}.py`)
    )
  );

export function isFastapiEntrypoint(
  file: FileFsRef | { fsPath?: string }
): boolean {
  try {
    const fsPath = (file as FileFsRef).fsPath;
    if (!fsPath) return false;
    const contents = fs.readFileSync(fsPath, 'utf8');
    return FASTAPI_CONTENT_REGEX.test(contents);
  } catch {
    return false;
  }
}

/**
 * Detect a FastAPI entrypoint path relative to workPath, or return null if not found.
 */
export async function detectFastapiEntrypoint(
  workPath: string,
  configuredEntrypoint: string
): Promise<string | null> {
  const entry = configuredEntrypoint.endsWith('.py')
    ? configuredEntrypoint
    : `${configuredEntrypoint}.py`;

  try {
    const fsFiles = await glob('**', workPath);
    // If the configured entrypoint exists, use it
    if (fsFiles[entry]) return entry;

    // Otherwise search for candidates
    const candidates = FASTAPI_CANDIDATE_ENTRYPOINTS.filter(
      (c: string) => !!fsFiles[c]
    );
    if (candidates.length > 0) {
      const fastapiEntrypoint =
        candidates.find((c: string) =>
          isFastapiEntrypoint(fsFiles[c] as FileFsRef)
        ) || candidates[0];
      debug(`Detected FastAPI entrypoint: ${fastapiEntrypoint}`);
      return fastapiEntrypoint;
    }

    // Nothing found
    return null;
  } catch {
    debug('Failed to discover entrypoint for FastAPI');
    return null;
  }
}
