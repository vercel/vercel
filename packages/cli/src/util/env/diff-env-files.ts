import type { Dictionary } from '@vercel/client';
import chalk from 'chalk';

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
