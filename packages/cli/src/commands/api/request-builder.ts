import { readFile } from 'fs/promises';
import { resolve } from 'path';
import type { JSONObject, JSONValue } from '@vercel-internals/types';
import type { RequestConfig, ParsedFlags } from './types';

/**
 * Build a request configuration from CLI flags
 */
export async function buildRequest(
  endpoint: string,
  flags: ParsedFlags
): Promise<RequestConfig> {
  const headers: Record<string, string> = {};
  let body: JSONObject | string | undefined;

  // Parse custom headers (-H key:value)
  const customHeaders = flags['--header'] || [];
  for (const header of customHeaders) {
    const colonIndex = header.indexOf(':');
    if (colonIndex > 0) {
      const key = header.substring(0, colonIndex).trim();
      const value = header.substring(colonIndex + 1).trim();
      headers[key] = value;
    }
  }

  // Build body from fields
  const fields = flags['--field'] || [];
  const rawFields = flags['--raw-field'] || [];

  if (fields.length > 0 || rawFields.length > 0) {
    body = {};

    // Parse typed fields (-F key=value)
    for (const field of fields) {
      const { key, value } = await parseField(field, true);
      body[key] = value;
    }

    // Parse raw (string) fields (-f key=value)
    for (const field of rawFields) {
      const { key, value } = await parseField(field, false);
      body[key] = value;
    }
  }

  // Read body from file (--input)
  if (flags['--input']) {
    const inputPath = flags['--input'];
    if (inputPath === '-') {
      body = await readStdin();
    } else {
      body = await readFile(resolve(inputPath), 'utf-8');
    }

    // Try to parse as JSON
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body) as JSONObject;
      } catch {
        // Keep as string if not valid JSON
      }
    }
  }

  // Determine method
  let method = flags['--method']?.toUpperCase() || 'GET';
  if (!flags['--method'] && body) {
    method = 'POST';
  }

  return {
    url: endpoint,
    method,
    headers,
    body,
  };
}

/**
 * Parse a field string into key-value pair
 * @param field - The field string (key=value)
 * @param typed - Whether to parse value types (bool, int, file)
 */
async function parseField(
  field: string,
  typed: boolean
): Promise<{ key: string; value: JSONValue }> {
  const eqIndex = field.indexOf('=');
  if (eqIndex === -1) {
    throw new Error(`Invalid field format: ${field}. Expected key=value`);
  }

  const key = field.substring(0, eqIndex);
  let value: JSONValue = field.substring(eqIndex + 1);

  if (typed && typeof value === 'string') {
    // File reference (@filename)
    if (value.startsWith('@')) {
      const filePath = value.substring(1);
      if (filePath === '-') {
        value = await readStdin();
      } else {
        value = await readFile(resolve(filePath), 'utf-8');
      }
      // Try to parse file contents as JSON
      if (typeof value === 'string') {
        try {
          value = JSON.parse(value);
        } catch {
          // Keep as string
        }
      }
    } else if (value === 'true') {
      value = true;
    } else if (value === 'false') {
      value = false;
    } else if (value === 'null') {
      value = null;
    } else if (/^-?\d+$/.test(value)) {
      value = parseInt(value, 10);
    } else if (/^-?\d*\.\d+$/.test(value)) {
      value = parseFloat(value);
    } else if (value.startsWith('[') || value.startsWith('{')) {
      // Try to parse JSON arrays and objects
      try {
        value = JSON.parse(value);
      } catch {
        // Keep as string if not valid JSON
      }
    }
  }

  return { key, value };
}

/**
 * Read all input from stdin
 */
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

/**
 * Format output data
 */
export function formatOutput(
  data: unknown,
  options: { raw?: boolean }
): string {
  if (options.raw) {
    if (typeof data === 'string') {
      return data;
    }
    return JSON.stringify(data);
  }

  // Pretty print JSON with 2-space indentation
  return JSON.stringify(data, null, 2);
}

/**
 * Generate a curl command from a RequestConfig
 */
export function generateCurlCommand(
  config: RequestConfig,
  baseUrl: string
): string {
  const parts: string[] = ['curl'];

  // Method (if not GET)
  if (config.method !== 'GET') {
    parts.push(`-X ${config.method}`);
  }

  // Authorization header with placeholder
  parts.push(`-H 'Authorization: Bearer <TOKEN>'`);

  // Headers
  for (const [key, value] of Object.entries(config.headers)) {
    parts.push(`-H '${key}: ${escapeShellArg(value)}'`);
  }

  // Body
  if (config.body) {
    const bodyStr =
      typeof config.body === 'string'
        ? config.body
        : JSON.stringify(config.body);
    parts.push(`-H 'Content-Type: application/json'`);
    parts.push(`-d '${escapeShellArg(bodyStr)}'`);
  }

  // URL (with placeholder for auth header)
  const fullUrl = `${baseUrl}${config.url}`;
  parts.push(`'${fullUrl}'`);

  return parts.join(' \\\n  ');
}

/**
 * Escape a string for use in a shell single-quoted argument
 */
function escapeShellArg(str: string): string {
  // In single quotes, only single quotes need escaping
  // We escape by ending the quote, adding escaped quote, and starting new quote
  return str.replace(/'/g, "'\\''");
}
