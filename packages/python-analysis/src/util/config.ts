import path from 'node:path';

import yaml from 'js-yaml';
import toml from 'smol-toml';
import { z } from 'zod';
import { PythonAnalysisError } from './error';
import { readFileTextIfExists } from './fs';

/**
 * Parse raw content into a JavaScript object based on file type.
 */
function parseRawConfig(
  content: string,
  filename: string,
  filetype: string | undefined = undefined
): unknown {
  if (filetype === undefined) {
    filetype = path.extname(filename.toLowerCase());
  }
  try {
    if (filetype === '.json') {
      return JSON.parse(content);
    } else if (filetype === '.toml') {
      return toml.parse(content);
    } else if (filetype === '.yaml' || filetype === '.yml') {
      return yaml.load(content, { filename });
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

/**
 * Parse config content and validate it against a zod schema.
 *
 * @param content - Raw file content
 * @param filename - File path (used for error messages and format detection)
 * @param schema - Zod schema to validate against
 * @param filetype - Optional file type override (e.g., '.toml', '.json')
 * @returns Validated and typed config object
 */
export function parseConfig<T>(
  content: string,
  filename: string,
  schema: z.ZodType<T>,
  filetype: string | undefined = undefined
): T {
  const raw = parseRawConfig(content, filename, filetype);

  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map(issue => {
        const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
        return `  - ${path}: ${issue.message}`;
      })
      .join('\n');
    throw new PythonAnalysisError({
      message: `Invalid config in "${filename}":\n${issues}`,
      code: 'PYTHON_CONFIG_VALIDATION_ERROR',
      path: filename,
    });
  }

  return result.data;
}

/**
 * Read a config file if it exists and validate it against a zod schema.
 *
 * @param filename - Path to the config file
 * @param schema - Zod schema to validate against
 * @param filetype - Optional file type override (e.g., '.toml', '.json')
 * @returns Validated config object, or null if file doesn't exist
 */
export async function readConfigIfExists<T>(
  filename: string,
  schema: z.ZodType<T>,
  filetype: string | undefined = undefined
): Promise<T | null> {
  const content = await readFileTextIfExists(filename);
  if (content == null) {
    return null;
  }
  return parseConfig(content, filename, schema, filetype);
}
