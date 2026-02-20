import yaml from 'js-yaml';
import toml from '@iarna/toml';
import { createReadStream, readFile } from 'fs-extra';
import { isErrnoException } from '@vercel/error-utils';
import { basename, join } from 'path';
import { createInterface } from 'readline';
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
          return toml.parse(str) as unknown as T;
        } else if (name.endsWith('.yaml') || name.endsWith('.yml')) {
          return yaml.safeLoad(str, { filename: name }) as T;
        }
      } catch (error: unknown) {
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
  } catch (err) {
    return {};
  }
}

const MAX_LINES_TO_READ = 10;

/**
 * Reads only the first few lines of a file.
 * This is an optimization to avoid reading entire large lockfiles.
 */
async function readFirstLines(
  filePath: string,
  maxLines: number
): Promise<string | null> {
  try {
    const lines: string[] = [];
    const stream = createReadStream(filePath, { encoding: 'utf8' });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      lines.push(line);
      if (lines.length >= maxLines) {
        break;
      }
    }

    // Clean up the stream
    rl.close();
    stream.destroy();

    return lines.join('\n');
  } catch (error: unknown) {
    if (!isErrnoException(error)) {
      throw error;
    }
    if (error.code !== 'ENOENT') {
      throw error;
    }
    return null;
  }
}

/**
 * Extracts lockfileVersion from pnpm-lock.yaml header.
 * Format: lockfileVersion: '6.0' or lockfileVersion: 6.0
 */
function extractPnpmLockfileVersion(content: string): number | null {
  const match = content.match(/^lockfileVersion:\s*['"]?([\d.]+)['"]?/m);
  if (match) {
    return Number(match[1]);
  }
  return null;
}

/**
 * Extracts lockfileVersion from package-lock.json or bun.lock header.
 * Format: "lockfileVersion": 2
 */
function extractJsonLockfileVersion(content: string): number | null {
  const match = content.match(/"lockfileVersion":\s*(\d+)/);
  if (match) {
    return Number(match[1]);
  }
  return null;
}

/**
 * Reads lockfile version by first checking the first 10 lines.
 * Falls back to full file parsing if version not found in header.
 * This is an optimization since lockfiles can be very large but
 * version info is typically at the top.
 */
export async function readLockfileVersion(
  filePath: string
): Promise<{ lockfileVersion: number } | null> {
  const filename = basename(filePath);

  // Try to extract version from header first (optimization)
  const header = await readFirstLines(filePath, MAX_LINES_TO_READ);
  if (header === null) {
    return null;
  }

  let lockfileVersion: number | null = null;

  if (filename === 'pnpm-lock.yaml') {
    lockfileVersion = extractPnpmLockfileVersion(header);
  } else if (filename === 'package-lock.json' || filename === 'bun.lock') {
    lockfileVersion = extractJsonLockfileVersion(header);
  }

  // If we found the version in the header, return it
  if (lockfileVersion !== null) {
    return { lockfileVersion };
  }

  // Fall back to full file parsing for unknown formats or if not found in header
  const config = await readConfigFile<{ lockfileVersion: number | string }>(
    filePath
  );

  // Ensure lockfileVersion is always a number, even if YAML parsing returns a string
  // Use !== undefined to handle lockfileVersion: 0 correctly (0 is falsy but valid)
  if (config && config.lockfileVersion !== undefined) {
    return { lockfileVersion: Number(config.lockfileVersion) };
  }

  return null;
}
