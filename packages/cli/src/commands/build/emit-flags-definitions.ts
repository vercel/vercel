import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import fetch from 'node-fetch';
import output from '../../output-manager';
import pkg from '../../util/pkg';

const FLAGS_HOST = 'https://flags.vercel.com';

type BundledDefinitions = Record<string, unknown>;
type DefinitionsJson = Record<string, BundledDefinitions>;

/**
 * Obfuscates SDK key for logging (shows first 18 chars)
 */
function obfuscate(sdkKey: string, prefixLength: number = 18): string {
  if (prefixLength >= sdkKey.length) return sdkKey;
  return (
    sdkKey.slice(0, prefixLength) + '*'.repeat(sdkKey.length - prefixLength)
  );
}

/**
 * Emits flag definitions into node_modules/@vercel/flags-definitions
 *
 * Reads SDK keys (vf_ prefix) from environment variables, fetches definitions
 * from flags.vercel.com, and writes them to a synthetic package that can be
 * imported at runtime.
 */
export async function emitFlagsDefinitions(
  cwd: string,
  env: NodeJS.ProcessEnv
): Promise<void> {
  // Collect unique SDK keys from environment variables (vf_ prefix only)
  const sdkKeys = Array.from(
    Object.values(env).reduce<Set<string>>((acc, value) => {
      if (typeof value === 'string' && value.startsWith('vf_')) {
        acc.add(value);
      }
      return acc;
    }, new Set<string>())
  );

  if (sdkKeys.length === 0) {
    output.debug('No flags SDK keys found');
    return;
  }

  // Fetch definitions for each SDK key
  const fetchPromise = Promise.all(
    sdkKeys.map(async sdkKey => {
      const headers: Record<string, string> = {
        authorization: `Bearer ${sdkKey}`,
        'user-agent': `VercelCLI/${pkg.version}`,
      };

      // Add Vercel metadata headers if available
      if (env.VERCEL_PROJECT_ID) {
        headers['x-vercel-project-id'] = env.VERCEL_PROJECT_ID;
      }
      if (env.VERCEL_ENV) {
        headers['x-vercel-env'] = env.VERCEL_ENV;
      }
      if (env.VERCEL_DEPLOYMENT_ID) {
        headers['x-vercel-deployment-id'] = env.VERCEL_DEPLOYMENT_ID;
      }
      if (env.VERCEL_REGION) {
        headers['x-vercel-region'] = env.VERCEL_REGION;
      }

      const res = await fetch(`${FLAGS_HOST}/v1/datafile`, { headers });

      if (!res.ok) {
        throw new Error(
          `Failed to fetch flag definitions for ${obfuscate(sdkKey)}: ${res.status} ${res.statusText}`
        );
      }

      return res.json() as Promise<BundledDefinitions>;
    })
  );

  const values = await output.time('Fetch flag definitions', fetchPromise);

  // Build definitions object keyed by SDK key
  const definitions = sdkKeys.reduce<DefinitionsJson>((acc, sdkKey, index) => {
    const value = values[index];
    if (value) acc[sdkKey] = value;
    return acc;
  }, {});

  // Write to node_modules/@vercel/flags-definitions/
  const storageDir = join(cwd, 'node_modules', '@vercel', 'flags-definitions');
  const definitionsPath = join(storageDir, 'definitions.json');
  const packageJsonPath = join(storageDir, 'package.json');

  await mkdir(storageDir, { recursive: true });
  await writeFile(definitionsPath, JSON.stringify(definitions));

  const packageJson = {
    name: '@vercel/flags-definitions',
    version: '1.0.0',
    type: 'module',
    exports: {
      './definitions.json': './definitions.json',
    },
  };
  await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));

  output.debug('Flags definitions snapshot created:');
  output.debug(`  → ${definitionsPath}`);
  output.debug(`  → ${packageJsonPath}`);
  for (const key of Object.keys(definitions)) {
    output.debug(`  → included definitions for key "${obfuscate(key)}"`);
  }
}
