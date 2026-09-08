import yaml from 'js-yaml';
import { parse as tomlParse } from 'smol-toml';
import { readFile } from 'fs-extra';
import { isErrnoException } from '@vercel/error-utils';
import { join } from 'path';
import type { PackageJson } from '../types';

async function readFileOrNull(file: string) {
  try {
    const data = await readFile(file);
    return data;
  } catch (error: unknown) {
    if (!isErrnoException(error)) {
      throw error;
    }
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  return null;
}

export async function readConfigFile<T>(
  files: string | string[]
): Promise<T | null> {
  files = Array.isArray(files) ? files : [files];

  for (const name of files) {
    const data = await readFileOrNull(name);

    if (data) {
      const str = data.toString('utf8');
      try {
        if (name.endsWith('.json')) {
          return JSON.parse(str) as T;
        } else if (name.endsWith('.toml')) {
          return tomlParse(str) as unknown as T;
        } else if (name.endsWith('.yaml') || name.endsWith('.yml')) {
          const docs: Array<T | null> = [];
          yaml.safeLoadAll(str, doc => docs.push(doc as T | null), {
            filename: name,
          });
          const parsedYaml = docs.at(-1);
          return parsedYaml ?? null;
        }
      } catch (_error: unknown) {
        console.log(`Error while parsing config file: "${name}"`);
      }
    }
  }

  return null;
}

/**
 * Reads and parses the package.json file from a directory.
 * Returns an empty object if the file doesn't exist or can't be parsed.
 */
export async function getPackageJson(dir: string): Promise<PackageJson> {
  const packagePath = join(dir, 'package.json');

  try {
    return JSON.parse(await readFile(packagePath, 'utf8'));
  } catch (_err) {
    return {};
  }
}
