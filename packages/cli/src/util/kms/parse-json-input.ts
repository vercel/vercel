import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { text } from 'node:stream/consumers';
import type { JSONObject } from '@vercel-internals/types';
import type Client from '../client';

async function readStdinToEnd(stdin: Client['stdin']): Promise<string> {
  if (stdin.isTTY) {
    return '';
  }
  return text(stdin);
}

/**
 * Resolves a flag value that may be inline content, `@<path>` to read a file
 * (relative paths resolved against `cwd`), or `@-` to read stdin. File and
 * stdin sources keep sensitive input out of argv, shell history, and process
 * listings.
 */
export async function resolveFlagSource(
  client: Client,
  flagName: string,
  raw: string
): Promise<string> {
  if (!raw.startsWith('@')) {
    return raw;
  }
  const source = raw.slice(1);
  if (source === '-') {
    return readStdinToEnd(client.stdin);
  }
  if (source.length === 0) {
    throw new Error(
      `Invalid ${flagName} value. Use \`@<path>\` to read from a file or \`@-\` to read from stdin.`
    );
  }
  try {
    return await readFile(resolve(client.cwd, source), 'utf8');
  } catch (err) {
    throw new Error(
      `Couldn't read ${flagName} file at "${source}": ${(err as Error).message}`
    );
  }
}

/**
 * Resolves and parses a JSON-object flag. Accepts inline JSON, `@<path>`, or
 * `@-`. Throws with an actionable message so the caller can surface it without
 * exposing the raw value.
 */
export async function parseJsonObjectFlag(
  client: Client,
  flagName: string,
  raw: string
): Promise<JSONObject> {
  const source = await resolveFlagSource(client, flagName, raw);
  if (source.trim().length === 0) {
    throw new Error(`${flagName} requires a non-empty JSON object.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error(`Invalid JSON for ${flagName}. Expected a JSON object.`);
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${flagName} must be a JSON object.`);
  }

  return parsed as JSONObject;
}

/**
 * Reads a PEM private key from a file path, or from stdin when the value is
 * `-`. A private key is never accepted as an inline argv value: argv is
 * visible in shell history and process listings.
 */
export async function readPrivateKey(
  client: Client,
  raw: string
): Promise<string> {
  const pem =
    raw === '-'
      ? await readStdinToEnd(client.stdin)
      : await readPem(client, raw);
  if (pem.trim().length === 0) {
    throw new Error(
      '--key is empty. Pass a path to a PEM private key file, or `-` to read it from stdin.'
    );
  }
  if (!pem.includes('-----BEGIN')) {
    throw new Error(
      '--key must be a PEM-encoded private key. Pass a path to a `.pem` file, or `-` to read it from stdin.'
    );
  }
  return pem;
}

async function readPem(client: Client, path: string): Promise<string> {
  try {
    return await readFile(resolve(client.cwd, path), 'utf8');
  } catch (err) {
    throw new Error(
      `Couldn't read --key file at "${path}": ${(err as Error).message}`
    );
  }
}
