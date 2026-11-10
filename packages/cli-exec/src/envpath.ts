import path from 'node:path';

/**
 * Prepends path entries while preserving existing entries and order.
 */
export function prependPathEntries(
  pathValue: string,
  directories: string[]
): string {
  const pathParts = pathValue.split(path.delimiter).filter(Boolean);
  const prepended: string[] = [];

  for (const directory of directories) {
    if (!pathParts.includes(directory) && !prepended.includes(directory)) {
      prepended.push(directory);
    }
  }

  if (prepended.length === 0) {
    return pathValue;
  }

  return pathValue === '' || pathValue === path.delimiter
    ? `${prepended.join(path.delimiter)}${pathValue}`
    : [...prepended, pathValue].join(path.delimiter);
}

/**
 * Splits a PATH value into non-empty directory entries.
 */
export function splitPath(pathValue: string): string[] {
  return pathValue.split(path.delimiter).filter(Boolean);
}

/**
 * Reads PATH from an environment object with Windows casing compatibility.
 */
export function getEnvPath(env: NodeJS.ProcessEnv = process.env): string {
  if (process.platform !== 'win32') {
    return env.PATH ?? '';
  }

  const pathKeys = Object.keys(env).filter(key => key.toLowerCase() === 'path');

  for (let index = pathKeys.length - 1; index >= 0; index--) {
    const value = env[pathKeys[index]];
    if (value !== undefined) {
      return value;
    }
  }

  return '';
}

/**
 * Writes PATH to an environment object with normalized Windows casing.
 */
export function setEnvPath(
  env: NodeJS.ProcessEnv = process.env,
  pathValue: string
): NodeJS.ProcessEnv {
  if (process.platform !== 'win32') {
    return {
      ...env,
      PATH: pathValue,
    };
  }

  const normalizedEnv = { ...env };

  for (const key of Object.keys(normalizedEnv)) {
    if (key !== 'PATH' && key.toLowerCase() === 'path') {
      delete normalizedEnv[key];
    }
  }

  normalizedEnv.PATH = pathValue;
  return normalizedEnv;
}
