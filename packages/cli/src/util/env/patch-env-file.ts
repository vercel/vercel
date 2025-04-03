import { outputFile } from 'fs-extra';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { isErrnoException } from '@vercel/error-utils';
import { CONTENTS_PREFIX, VARIABLES_TO_IGNORE } from './constants';
import { escapeValue } from './escape-value';
import { wasCreatedByVercel } from './was-created-by-vercel';
import { writeEnvFile } from './write-env-file';

async function tryRead(fullPath: string): Promise<string | undefined> {
  try {
    return await readFile(fullPath, { encoding: 'utf8' });
  } catch (err) {
    if (!isErrnoException(err) || err.code !== 'ENOENT') {
      throw err;
    }
  }
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
  filename: string,
  records: Record<string, string>
): Promise<void> {
  const fullPath = resolve(cwd, filename);
  const createdByVercel = await wasCreatedByVercel(fullPath);
  const exists = createdByVercel !== undefined;

  // Case 1.
  if (!exists) {
    // TODO(mroberts): Update .gitignore.
    return writeEnvFile(fullPath, records);
  }

  let contents = createdByVercel ? ((await tryRead(fullPath)) ?? '') : '';

  // Case 2.
  if (!contents.startsWith(CONTENTS_PREFIX)) return;

  const kvs = Object.keys(records)
    .sort()
    .filter(key => !VARIABLES_TO_IGNORE.includes(key))
    .map(key => [key, escapeValue(records[key])]);

  let shouldWrite = false;

  for (const [key, value] of kvs) {
    const regExp = new RegExp(`^ *${key} *= *"(?.*)"? *$`, 'm');

    // Case 3.
    const match = contents.match(regExp);
    if (match?.[1] === value) continue;

    const newKv = `${key}="${value}"`;
    shouldWrite = true;

    // Case 4.
    const newContents = contents.replace(regExp, newKv);
    if (newContents !== contents) {
      contents = newContents;
      continue;
    }

    // Case 5.
    if (!contents.endsWith('\n')) contents += '\n';
    contents += `${newKv}\n`;
  }

  if (shouldWrite) await outputFile(fullPath, contents);
}
