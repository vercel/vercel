import * as dotenvx from '@dotenvx/dotenvx';
import type { Dictionary } from '@vercel/client';
import chalk from 'chalk';
import { existsSync, outputFile, readFile } from 'fs-extra';
import { dirname, join } from 'path';
import output from '../../output-manager';

export async function createEnvObject(
  envPath: string
): Promise<Dictionary<string | undefined> | undefined> {
  try {
    const content = await readFile(envPath, 'utf-8');
    const privateKey = await getEncryptionKey(envPath);

    return dotenvx.parse(content, { processEnv: {}, privateKey });
  } catch (error) {
    output.debug(
      `Failed to parse env file: ${error instanceof Error ? error.message : String(error)}`
    );
    return undefined;
  }
}

export async function updateEnvFile(
  envPath: string,
  updates: Dictionary<string | undefined>
): Promise<void> {
  let backupContent: string | null = null;

  try {
    if (existsSync(envPath)) {
      backupContent = await readFile(envPath, 'utf8');
    }
  } catch (error) {
    throw new Error(
      `Failed to backup existing file: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const privateKey = await getEncryptionKey(envPath);

  try {
    for (const [key, value] of Object.entries(updates)) {
      dotenvx.set(key, value ?? '', { path: envPath, encrypt: !!privateKey });
    }
  } catch (error) {
    // Restore backup on any failure to ensure atomic operation
    if (backupContent !== null) {
      try {
        await outputFile(envPath, backupContent, 'utf8');
      } catch (restoreError) {
        throw new Error(
          `Failed to set environment variable and unable to restore backup: ${error instanceof Error ? error.message : String(error)}. Restore error: ${restoreError instanceof Error ? restoreError.message : String(restoreError)}`
        );
      }
    }
    throw new Error(
      `Failed to set environment variable: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function getEncryptionKey(envPath: string): Promise<string | undefined> {
  const keysPath = join(dirname(envPath), '.env.keys');
  if (!existsSync(keysPath)) {
    return undefined;
  }

  try {
    const content = await readFile(keysPath, 'utf8');
    const keys = dotenvx.parse(content, { processEnv: {} });
    return keys.DOTENV_PRIVATE_KEY;
  } catch (error) {
    output.debug(
      `Failed to read encryption key from ${keysPath}: ${error instanceof Error ? error.message : String(error)}`
    );
    return undefined;
  }
}

function findChanges(
  oldEnv: Dictionary<string | undefined>,
  newEnv: Dictionary<string | undefined>
): {
  added: string[];
  changed: string[];
  removed: string[];
} {
  const added = [];
  const changed = [];

  for (const key of Object.keys(newEnv)) {
    if (oldEnv[key] === undefined) {
      added.push(key);
    } else if (oldEnv[key] !== newEnv[key]) {
      changed.push(key);
    }
  }
  const removed = Object.keys(oldEnv).filter(key => !(key in newEnv));

  return {
    added,
    changed,
    removed,
  };
}

export function buildDeltaString(
  oldEnv: Dictionary<string | undefined>,
  newEnv: Dictionary<string | undefined>
): string {
  const { added, changed, removed } = findChanges(oldEnv, newEnv);

  let deltaString = '';
  deltaString += chalk.green(addDeltaSection('+', changed, true));
  deltaString += chalk.green(addDeltaSection('+', added));
  deltaString += chalk.red(addDeltaSection('-', removed));

  return deltaString
    ? chalk.gray('Changes:\n') + deltaString + '\n'
    : deltaString;
}

function addDeltaSection(
  prefix: string,
  arr: string[],
  changed: boolean = false
): string {
  if (arr.length === 0) return '';
  return (
    arr
      .sort()
      .map(item => `${prefix} ${item}${changed ? ' (Updated)' : ''}`)
      .join('\n') + '\n'
  );
}
