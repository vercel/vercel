import path from 'node:path';

import yaml from 'js-yaml';
import toml from 'smol-toml';
import { readFileTextIfExists } from './fs';
import { PythonAnalysisError } from './error';

export async function parseConfig<T>(
  content: string,
  filename: string,
  filetype: string | undefined = undefined
): Promise<T> {
  if (filetype === undefined) {
    filetype = path.extname(filename.toLowerCase());
  }
  try {
    if (filetype === '.json') {
      return JSON.parse(content) as T;
    } else if (filetype === '.toml') {
      return toml.parse(content) as unknown as T;
    } else if (filetype === '.yaml' || filetype === '.yml') {
      return yaml.load(content, { filename }) as T;
    } else {
      throw new PythonAnalysisError({
        message: `Could not parse config file "${filename}": unrecognized config format`,
        code: 'PYTHON_CONFIG_UNKNOWN_FORMAT',
        path: filename,
      });
    }
  } catch (error: unknown) {
    if (error instanceof PythonAnalysisError) {
      throw error;
    }
    if (error instanceof Error) {
      throw new PythonAnalysisError({
        message: `Could not parse config file "${filename}": ${error.message}`,
        code: 'PYTHON_CONFIG_PARSE_ERROR',
        path: filename,
      });
    }
    throw error;
  }
}

export async function readConfigIfExists<T>(
  filename: string,
  filetype: string | undefined = undefined
): Promise<T | null> {
  const content = await readFileTextIfExists(filename);
  if (content === null) {
    return null;
  } else {
    return parseConfig<T>(content, filename, filetype);
  }
}
