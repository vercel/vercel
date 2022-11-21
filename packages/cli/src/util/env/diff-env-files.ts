import { Output } from '../output';
import { Dictionary } from '@vercel/client';
import { readFile } from 'fs-extra';
import { parseEnv } from '../parse-env';
import chalk from 'chalk';

export async function createEnvObject(
  envPath: string,
  output: Output
): Promise<Dictionary<string | undefined> | undefined> {
  // Originally authored by Tyler Waters under MIT License: https://github.com/tswaters/env-file-parser/blob/f17c009b39da599380e069ee72728d1cafdb56b8/lib/parse.js
  // https://github.com/tswaters/env-file-parser/blob/f17c009b39da599380e069ee72728d1cafdb56b8/LICENSE
  const envArr = (await readFile(envPath, 'utf-8'))
    // remove double quotes
    .replace(/"/g, '')
    // split on new line
    .split(/\r?\n|\r/)
    // filter comments
    .filter(line => /^[^#]/.test(line))
    // needs equal sign
    .filter(line => /=/i.test(line));

  const parsedEnv = parseEnv(envArr);
  if (Object.keys(parsedEnv).length === 0) {
    output.debug('Failed to parse env file.');
    return;
  }
  return parsedEnv;
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
    delete oldEnv[key];
  }
  const removed = Object.keys(oldEnv);

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
