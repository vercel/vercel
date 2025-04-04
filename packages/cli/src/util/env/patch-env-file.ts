import { outputFile } from 'fs-extra';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { isErrnoException } from '@vercel/error-utils';
import { CONTENTS_PREFIX, VARIABLES_TO_IGNORE } from './constants';
import { escapeValue } from './escape-value';
import { wasCreatedByVercel } from './was-created-by-vercel';
import { writeEnvFile } from './write-env-file';
import { addToGitIgnore } from '../link/add-to-gitignore';
import { buildDeltaString } from './diff-env-files';

async function tryRead(fullPath: string): Promise<string | undefined> {
  try {
    return await readFile(fullPath, { encoding: 'utf8' });
  } catch (err) {
    if (!isErrnoException(err) || err.code !== 'ENOENT') {
      throw err;
    }
  }
}

export interface PatchEnvFileResult {
  exists: boolean;
  isGitIgnoreUpdated: boolean;
  deltaString: string;
}

/**
 * Patch an env file to contain the specified records.
 *
 *   1. If the env file does not exist, create it.
 *   2. If the env file is not managed by Vercel CLI, abort.
 *   3. If the env file already contains a key with the expected value, skip the key.
 *   4. If the env file contains a key with a stale value, overwrite it.
 *   5. If the env file lacks a key, append it it.
 *
 */
export async function patchEnvFile(
  cwd: string,
  rootPath: string,
  filename: string,
  records: Record<string, string>
): Promise<PatchEnvFileResult | undefined> {
  const fullPath = resolve(cwd, filename);
  const createdByVercel = await wasCreatedByVercel(fullPath);
  const exists = createdByVercel !== undefined;
  let isGitIgnoreUpdated = false;

  // Case 1.
  if (!exists) {
    await writeEnvFile(fullPath, records);

    if (filename === '.env.local') {
      // See note in src/commands/env/pull.ts.
      isGitIgnoreUpdated = await addToGitIgnore(rootPath, '.env*.local');
    }

    const deltaString = buildDeltaString({}, records);
    return { exists, isGitIgnoreUpdated, deltaString };
  }

  let contents = createdByVercel ? ((await tryRead(fullPath)) ?? '') : '';

  // Case 2.
  if (!contents.startsWith(CONTENTS_PREFIX)) return undefined;

  const kvs = Object.keys(records)
    .sort()
    .filter(key => !VARIABLES_TO_IGNORE.includes(key))
    .map(key => [key, escapeValue(records[key])]);

  const oldEnv: Record<string, string> = {};
  const newEnv: Record<string, string> = {};
  let didUpdate = false;

  for (const [key, value] of kvs) {
    const regExp = new RegExp(`^ *${key} *= *"?(.*)"? *$`, 'm');

    // Case 3.
    const match = contents.match(regExp);
    if (match?.[1] === value) continue;

    const newKv = `${key}="${value}"`;
    didUpdate = true;

    // Case 4.
    const newContents = contents.replace(regExp, newKv);
    if (newContents !== contents) {
      contents = newContents;
      oldEnv[key] = 'old';
      newEnv[key] = 'new';
      continue;
    }

    // Case 5.
    if (!contents.endsWith('\n')) contents += '\n';
    contents += `${newKv}\n`;
    newEnv[key] = 'new';
  }

  if (didUpdate) await outputFile(fullPath, contents);

  const deltaString = buildDeltaString(oldEnv, newEnv);
  return { exists, isGitIgnoreUpdated, deltaString };
}
