import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import fetch from 'node-fetch';
import output from '../../output-manager';

/**
 * Edge Config types
 */
export interface EmbeddedEdgeConfig {
  digest: string;
  items: Record<string, EdgeConfigValue>;
}

export type BundledEdgeConfig = {
  data: EmbeddedEdgeConfig;
  updatedAt: number | undefined;
};

export type Connection =
  | {
      baseUrl: string;
      id: string;
      token: string;
      version: string;
      type: 'vercel';
      snapshot: 'required' | 'optional';
      timeoutMs: number | undefined;
    }
  | {
      baseUrl: string;
      id: string;
      token: string;
      version: string;
      type: 'external';
      snapshot: 'required' | 'optional';
      timeoutMs: number | undefined;
    };

export type EdgeConfigValue =
  | string
  | number
  | boolean
  | null
  | { [x: string]: EdgeConfigValue }
  | EdgeConfigValue[];

type StoresJson = Record<string, BundledEdgeConfig>;

/**
 * Parses internal edge config connection strings
 *
 * Internal edge config connection strings are those which are native to Vercel.
 *
 * Internal Edge Config Connection Strings look like this:
 * https://edge-config.vercel.com/<edgeConfigId>?token=<token>
 */
function parseVercelConnectionStringFromUrl(text: string): Connection | null {
  try {
    const url = new URL(text);
    if (url.host !== 'edge-config.vercel.com') return null;
    if (url.protocol !== 'https:') return null;
    if (!url.pathname.startsWith('/ecfg')) return null;

    const id = url.pathname.split('/')[1];
    if (!id) return null;

    const token = url.searchParams.get('token');
    if (!token || token === '') return null;

    const snapshot =
      url.searchParams.get('snapshot') === 'required' ? 'required' : 'optional';

    const timeoutMs = parseTimeoutMs(url.searchParams.get('timeoutMs'));

    return {
      type: 'vercel',
      baseUrl: `https://edge-config.vercel.com/${id}`,
      id,
      version: '1',
      token,
      snapshot,
      timeoutMs,
    };
  } catch {
    return null;
  }
}

export function parseTimeoutMs(timeoutMs: string | null): number | undefined {
  if (!timeoutMs) return undefined;
  const parsedTimeoutMs = Number.parseInt(timeoutMs, 10);
  if (Number.isNaN(parsedTimeoutMs)) return undefined;
  return parsedTimeoutMs;
}

/**
 * Parses a connection string with the following format:
 * `edge-config:id=ecfg_abcd&token=xxx`
 */
function parseConnectionFromQueryParams(text: string): Connection | null {
  try {
    if (!text.startsWith('edge-config:')) return null;
    const params = new URLSearchParams(text.slice(12));

    const id = params.get('id');
    const token = params.get('token');

    if (!id || !token) return null;

    const snapshot =
      params.get('snapshot') === 'required' ? 'required' : 'optional';

    const timeoutMs = parseTimeoutMs(params.get('timeoutMs'));

    return {
      type: 'vercel',
      baseUrl: `https://edge-config.vercel.com/${id}`,
      id,
      version: '1',
      token,
      snapshot,
      timeoutMs,
    };
  } catch {
    // no-op
  }

  return null;
}

/**
 * Parses external edge config connection strings
 *
 * External edge config connection strings are those which are foreign to Vercel.
 *
 * External Edge Config Connection Strings look like this:
 * - https://example.com/?id=<edgeConfigId>&token=<token>
 * - https://example.com/<edgeConfigId>?token=<token>
 */
function parseExternalConnectionStringFromUrl(
  connectionString: string
): Connection | null {
  try {
    const url = new URL(connectionString);

    let id: string | null = url.searchParams.get('id');
    const token = url.searchParams.get('token');
    const version = url.searchParams.get('version') || '1';

    // try to determine id based on pathname if it wasn't provided explicitly
    if (!id || url.pathname.startsWith('/ecfg_')) {
      id = url.pathname.split('/')[1] || null;
    }

    if (!id || !token) return null;

    const snapshot =
      url.searchParams.get('snapshot') === 'required' ? 'required' : 'optional';

    const timeoutMs = parseTimeoutMs(url.searchParams.get('timeoutMs'));

    // remove all search params for use as baseURL
    url.search = '';

    // try to parse as external connection string
    return {
      type: 'external',
      baseUrl: url.toString(),
      id,
      token,
      version,
      snapshot,
      timeoutMs,
    };
  } catch {
    return null;
  }
}

/**
 * Parse the edgeConfigId and token from an Edge Config Connection String.
 *
 * Edge Config Connection Strings usually look like one of the following:
 *  - https://edge-config.vercel.com/<edgeConfigId>?token=<token>
 *  - edge-config:id=<edgeConfigId>&token=<token>
 *
 * @param text - A potential Edge Config Connection String
 * @returns The connection parsed from the given Connection String or null.
 */
export function parseConnectionString(
  connectionString: string
): Connection | null {
  return (
    parseConnectionFromQueryParams(connectionString) ||
    parseVercelConnectionStringFromUrl(connectionString) ||
    parseExternalConnectionStringFromUrl(connectionString)
  );
}

/**
 * Parses a connection string with the following format:
 * `flags:edgeConfigId=ecfg_abcd&edgeConfigToken=xxx`
 */
function parseConnectionFromFlags(text: string): Connection | null {
  try {
    if (!text.startsWith('flags:')) return null;
    const params = new URLSearchParams(text.slice(6));

    const id = params.get('edgeConfigId');
    const token = params.get('edgeConfigToken');

    if (!id || !token) return null;

    const snapshot =
      params.get('snapshot') === 'required' ? 'required' : 'optional';

    const timeoutMs = parseTimeoutMs(params.get('timeoutMs'));

    return {
      type: 'vercel',
      baseUrl: `https://edge-config.vercel.com/${id}`,
      id,
      version: '1',
      token,
      snapshot,
      timeoutMs,
    };
  } catch {
    // no-op
  }

  return null;
}

/**
 * Emits Edge Config snapshot files into node_modules/@vercel/edge-config-storage
 *
 * Reads all connected Edge Configs from environment variables and emits them into
 * node_modules/@vercel/edge-config-storage/stores.json along with a package.json
 * that exports the stores.json file.
 *
 * Attaches the updatedAt timestamp from the header to the emitted file.
 */
export async function emitEdgeConfigFiles(
  cwd: string,
  env: NodeJS.ProcessEnv
): Promise<void> {
  // Skip if disabled
  if (env.EDGE_CONFIG_SKIP_PREPARE_SCRIPT === '1') return;

  // Parse all Edge Config connections from environment variables
  const connections = Object.values(env).reduce<Connection[]>((acc, value) => {
    if (typeof value !== 'string') return acc;

    const data = parseConnectionString(value);
    if (data) acc.push(data);

    const vfData = parseConnectionFromFlags(value);
    if (vfData) acc.push(vfData);

    return acc;
  }, []);

  // If no connections found, nothing to do
  if (connections.length === 0) {
    output.debug('No Edge Config connections found');
    return;
  }

  // Fetch all Edge Config data
  const fetchPromise = Promise.all(
    connections.map<Promise<BundledEdgeConfig>>(async connection => {
      const res = await fetch(connection.baseUrl, {
        headers: {
          authorization: `Bearer ${connection.token}`,
          // consistentRead
          'x-edge-config-min-updated-at': `${Number.MAX_SAFE_INTEGER}`,
          'user-agent': '@vercel/cli (build)',
        },
      });

      if (!res.ok) {
        throw new Error(
          `Failed to fetch edge config ${connection.id}: ${res.status} ${res.statusText}`
        );
      }

      const ts = res.headers.get('x-edge-config-updated-at');
      const data: EmbeddedEdgeConfig = await res.json();
      return { data, updatedAt: ts ? Number(ts) : undefined };
    })
  );
  const promiseAll = output.time(
    'Fetch connected Edge Config stores',
    fetchPromise
  );
  const values: BundledEdgeConfig[] = await promiseAll;

  // Build the stores object
  const stores = connections.reduce<StoresJson>((acc, connection, index) => {
    const value = values[index];
    acc[connection.id] = value;
    return acc;
  }, {});

  // Determine the output directory in node_modules
  const storageDir = join(
    cwd,
    'node_modules',
    '@vercel',
    'edge-config-storage'
  );
  const storesJsonPath = join(storageDir, 'stores.json');
  const packageJsonPath = join(storageDir, 'package.json');

  // Ensure the storage directory exists
  await mkdir(storageDir, { recursive: true });

  // Write the stores.json file
  await writeFile(storesJsonPath, JSON.stringify(stores));

  // Create a package.json that exports stores.json
  const packageJson = {
    name: '@vercel/edge-config-storage',
    version: '1.0.0',
    type: 'module',
    exports: {
      './stores.json': './stores.json',
    },
  };
  await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));

  output.debug('Edge Config snapshot created:');
  output.debug(`  → ${storesJsonPath}`);
  output.debug(`  → ${packageJsonPath}`);
  output.debug(`  → included ${Object.keys(stores).join(', ')}`);
}
