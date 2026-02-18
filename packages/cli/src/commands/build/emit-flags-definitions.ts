import { NowBuildError } from '@vercel/build-utils';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import output from '../../output-manager';
import pkg from '../../util/pkg';

const FLAGS_HOST = 'https://flags.vercel.com';
const FLAGS_DEFINITIONS_VERSION = '1.0.0';

type BundledDefinitions = Record<string, unknown>;

/**
 * Obfuscates SDK key for logging (shows first 18 chars)
 */
function obfuscate(sdkKey: string, prefixLength = 18): string {
  if (prefixLength >= sdkKey.length) return sdkKey;
  return (
    sdkKey.slice(0, prefixLength) + '*'.repeat(sdkKey.length - prefixLength)
  );
}

/**
 * Generates a JS module with deduplicated, lazily-parsed definitions.
 *
 * Output format:
 * ```js
 * const memo = (fn) => { let cached; return () => (cached ??= fn()); };
 * const _d0 = memo(() => JSON.parse('...'));
 * const map = { "vf_key1": _d0, "vf_key2": _d0 };
 * export function get(sdkKey) { return map[sdkKey]?.() ?? null; }
 * ```
 */
function generateDefinitionsModule(
  sdkKeys: string[],
  values: BundledDefinitions[]
): string {
  // Stringify each definition
  const stringified = sdkKeys.map((_, i) => JSON.stringify(values[i]));

  // Deduplicate: map unique strings to indices
  const uniqueStrings: string[] = [];
  const stringToIndex = new Map<string, number>();
  for (const s of stringified) {
    if (!stringToIndex.has(s)) {
      stringToIndex.set(s, uniqueStrings.length);
      uniqueStrings.push(s);
    }
  }

  // Map SDK keys to their definition index
  const keyToIndex = sdkKeys.map((_, i) => stringToIndex.get(stringified[i]));

  // Generate JS
  const lines: string[] = [
    'const memo = (fn) => { let cached; return () => (cached ??= fn()); };',
    '',
  ];

  // Add definition constants
  for (let i = 0; i < uniqueStrings.length; i++) {
    lines.push(
      `const _d${i} = memo(() => JSON.parse(${JSON.stringify(uniqueStrings[i])}));`
    );
  }

  lines.push('');
  lines.push('const map = {');
  for (let i = 0; i < sdkKeys.length; i++) {
    lines.push(`  ${JSON.stringify(sdkKeys[i])}: _d${keyToIndex[i]},`);
  }
  lines.push('};');
  lines.push('');
  lines.push('export function get(sdkKey) {');
  lines.push('  return map[sdkKey]?.() ?? null;');
  lines.push('}');
  lines.push('');
  lines.push(
    `export const version = ${JSON.stringify(FLAGS_DEFINITIONS_VERSION)};`
  );

  return lines.join('\n');
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
  output.debug('vercel-flags: checking env vars for SDK Keys');

  // Collect unique SDK keys from environment variables
  // Supports both direct SDK keys (vf_ prefix) and flags: format
  const sdkKeys = Array.from(
    Object.values(env).reduce<Set<string>>((acc, value) => {
      if (typeof value === 'string') {
        if (value.startsWith('vf_')) {
          acc.add(value);
        } else if (value.startsWith('flags:')) {
          const params = new URLSearchParams(value.slice('flags:'.length));
          const sdkKey = params.get('sdkKey');
          if (sdkKey?.startsWith('vf_')) {
            acc.add(sdkKey);
          }
        }
      }
      return acc;
    }, new Set<string>())
  );

  output.debug(`vercel-flags: found ${sdkKeys.length} SDK keys`);

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
        throw new NowBuildError({
          code: 'VERCEL_FLAGS_DEFINITIONS_FETCH_FAILED',
          message: `Failed to fetch flag definitions for ${obfuscate(sdkKey)}: ${res.status} ${res.statusText}`,
          link: 'https://vercel.com/docs/flags', // TODO replace with better link once we have a docs page
        });
      }

      return res.json() as Promise<BundledDefinitions>;
    })
  );

  const values = await output.time(
    'vercel-flags: load datafiles',
    fetchPromise
  );

  // Generate the JS module
  const definitionsJs = generateDefinitionsModule(sdkKeys, values);

  // Write to node_modules/@vercel/flags-definitions/
  const storageDir = join(cwd, 'node_modules', '@vercel', 'flags-definitions');
  const indexPath = join(storageDir, 'index.js');
  const dtsPath = join(storageDir, 'index.d.ts');
  const packageJsonPath = join(storageDir, 'package.json');
  const dts = [
    'export function get(sdkKey: string): Record<string, unknown> | null;',
    'export const version: string;',
    '',
  ].join('\n');

  const packageJson = {
    name: '@vercel/flags-definitions',
    version: FLAGS_DEFINITIONS_VERSION,
    type: 'module',
    main: './index.js',
    types: './index.d.ts',
    exports: {
      '.': {
        types: './index.d.ts',
        import: './index.js',
      },
    },
  };

  await mkdir(storageDir, { recursive: true });
  await Promise.all([
    writeFile(indexPath, definitionsJs),
    writeFile(dtsPath, dts),
    writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2)),
  ]);

  output.debug('vercel-flags: created module');
  output.debug(`  → ${indexPath}`);
  output.debug(`  → ${dtsPath}`);
  output.debug(`  → ${packageJsonPath}`);
  output.debug(
    `  → included definitions for keys "${sdkKeys.map(key => obfuscate(key)).join(', ')}"`
  );
}
