import yaml from 'js-yaml';
import toml from '@iarna/toml';
import { promises } from 'fs';

const { readFile } = promises;

async function readFileOrNull(file: string) {
  try {
    const data = await readFile(file);
    return data;
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
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
      if (name.endsWith('.json')) {
        return JSON.parse(str) as T;
      } else if (name.endsWith('.toml')) {
        return (toml.parse(str) as unknown) as T;
      } else if (name.endsWith('.yaml') || name.endsWith('.yml')) {
        return yaml.safeLoad(str, { filename: name }) as T;
      }
    }
  }

  return null;
}
