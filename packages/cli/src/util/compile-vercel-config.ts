import { mkdir, writeFile, unlink, access } from 'fs/promises';
import { join, basename } from 'path';
import { fork } from 'child_process';
import { config as dotenvConfig } from 'dotenv';
import output from '../output-manager';
import { NowBuildError } from '@vercel/build-utils';
import type {
  RouteWithSrc,
  Rewrite,
  Redirect,
  Header,
} from '@vercel/routing-utils';
import { VERCEL_DIR } from './projects/link';
import { ConflictingConfigFiles } from './errors-ts';

// Input item that may be in legacy Route format (src) or modern format (source)
type RouteInput = RouteWithSrc | Rewrite | Redirect | Header;

function isRouteFormat(item: RouteInput): item is RouteWithSrc {
  return item && typeof item === 'object' && 'src' in item;
}

type RouteItemType = 'rewrite' | 'redirect' | 'header';

/**
 * Convert a rewrite, redirect, or header rule to Route format.
 * If already in Route format, returns unchanged.
 */
function toRouteFormat(item: RouteInput, type: RouteItemType): RouteWithSrc {
  if (isRouteFormat(item)) {
    return item;
  }

  const { source, destination, headers, statusCode, permanent, ...rest } =
    item as Rewrite & Redirect & Header;

  const route: RouteWithSrc = {
    src: source,
    ...rest,
  };

  if (destination !== undefined) {
    route.dest = destination;
  }

  if (Array.isArray(headers)) {
    const headersRecord: Record<string, string> = {};
    for (const h of headers) {
      headersRecord[h.key] = h.value;
    }
    route.headers = headersRecord;
  }

  if (type === 'redirect') {
    route.status = statusCode || (permanent ? 308 : 307);
  } else if (type === 'rewrite' && statusCode !== undefined) {
    route.status = statusCode;
  }

  return route;
}

export interface ConfigWithRouting {
  routes?: RouteInput[];
  rewrites?: RouteInput[];
  redirects?: RouteInput[];
  headers?: RouteInput[];
  [key: string]: unknown;
}

function isNonEmptyArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Converts `rewrites`, `redirects`, and `headers` arrays to Route format
 * and merges them into a single `routes` array.
 *
 * This allows users to write configs using the modern `rewrites`/`redirects`/`headers`
 * syntax while still supporting transforms and other Route-only features.
 *
 * If `routes` explicitly exists alongside `rewrites`/`redirects`/`headers`,
 * returns unchanged to let schema validation fail.
 */
export function normalizeConfig(config: ConfigWithRouting): ConfigWithRouting {
  const normalized: ConfigWithRouting = { ...config };
  let allRoutes: RouteWithSrc[] = [];

  if (isNonEmptyArray(normalized.routes)) {
    allRoutes = normalized.routes as RouteWithSrc[];
  }

  const hasRoutes = allRoutes.length > 0;
  const { rewrites, redirects, headers } = normalized;

  if (
    hasRoutes &&
    (isNonEmptyArray(rewrites) ||
      isNonEmptyArray(redirects) ||
      isNonEmptyArray(headers))
  ) {
    return normalized;
  }

  function convertToRoutes(
    items: RouteInput[] | undefined,
    type: RouteItemType,
    key: 'rewrites' | 'redirects' | 'headers'
  ): RouteWithSrc[] {
    if (!isNonEmptyArray(items)) return [];
    delete normalized[key];
    return items.map(item => toRouteFormat(item, type));
  }

  allRoutes.push(
    ...convertToRoutes(rewrites, 'rewrite', 'rewrites'),
    ...convertToRoutes(redirects, 'redirect', 'redirects'),
    ...convertToRoutes(headers, 'header', 'headers')
  );

  // Normalize any remaining items in routes array
  // (e.g., routes.redirect() mixed with routes.rewrite() in the routes array)
  if (allRoutes.length > 0) {
    // Detect type: redirects have 'permanent' or 'statusCode', everything else is a rewrite
    allRoutes = allRoutes.map(item => {
      const type: RouteItemType =
        'permanent' in item || 'statusCode' in item ? 'redirect' : 'rewrite';
      return toRouteFormat(item, type);
    });
    normalized.routes = allRoutes;
  }

  return normalized;
}

export interface CompileConfigResult {
  configPath: string | null;
  wasCompiled: boolean;
  sourceFile?: string;
}

export const VERCEL_CONFIG_EXTENSIONS = [
  'ts',
  'mts',
  'js',
  'mjs',
  'cjs',
] as const;
export const DEFAULT_VERCEL_CONFIG_FILENAME = 'Vercel config';

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findAllVercelConfigFiles(workPath: string): Promise<string[]> {
  const foundFiles: string[] = [];
  for (const ext of VERCEL_CONFIG_EXTENSIONS) {
    const configPath = join(workPath, `vercel.${ext}`);
    if (await fileExists(configPath)) {
      foundFiles.push(configPath);
    }
  }
  return foundFiles;
}

/**
 * Finds the source vercel config file basename (e.g., 'vercel.ts', 'vercel.js')
 * @param workPath - The directory to search in
 * @returns The basename of the config file, or null if not found
 */
export async function findSourceVercelConfigFile(
  workPath: string
): Promise<string | null> {
  for (const ext of VERCEL_CONFIG_EXTENSIONS) {
    const configPath = join(workPath, `vercel.${ext}`);
    if (await fileExists(configPath)) {
      return basename(configPath);
    }
  }
  return null;
}

async function findVercelConfigFile(workPath: string): Promise<string | null> {
  const foundFiles = await findAllVercelConfigFiles(workPath);

  if (foundFiles.length > 1) {
    throw new ConflictingConfigFiles(
      foundFiles,
      'Multiple vercel config files found. Please use only one configuration file.',
      'https://vercel.com/docs/projects/project-configuration'
    );
  }

  return foundFiles[0] || null;
}

function parseConfigLoaderError(stderr: string): string {
  if (!stderr.trim()) {
    return '';
  }

  const moduleNotFoundMatch = stderr.match(
    /Error \[ERR_MODULE_NOT_FOUND\]: Cannot find package '([^']+)'/
  );
  if (moduleNotFoundMatch) {
    const packageName = moduleNotFoundMatch[1];
    return `Cannot find package '${packageName}'. Make sure it's installed in your project dependencies.`;
  }

  const syntaxErrorMatch = stderr.match(/SyntaxError: (.+?)(?:\n|$)/);
  if (syntaxErrorMatch) {
    return `Syntax error: ${syntaxErrorMatch[1]}`;
  }

  const errorMatch = stderr.match(
    /^(?:Error|TypeError|ReferenceError): (.+?)(?:\n|$)/m
  );
  if (errorMatch) {
    return errorMatch[1];
  }

  // otherwise just return the error
  return stderr.trim();
}

export async function compileVercelConfig(
  workPath: string
): Promise<CompileConfigResult> {
  const vercelJsonPath = join(workPath, 'vercel.json');
  const nowJsonPath = join(workPath, 'now.json');
  const hasVercelJson = await fileExists(vercelJsonPath);
  const hasNowJson = await fileExists(nowJsonPath);

  // Check for conflicting vercel.json and now.json
  if (hasVercelJson && hasNowJson) {
    throw new ConflictingConfigFiles([vercelJsonPath, nowJsonPath]);
  }

  const vercelConfigPath = await findVercelConfigFile(workPath);
  const vercelDir = join(workPath, VERCEL_DIR);
  const compiledConfigPath = join(vercelDir, 'vercel.json');

  if (vercelConfigPath && hasNowJson) {
    throw new ConflictingConfigFiles(
      [vercelConfigPath, nowJsonPath],
      `Both ${basename(vercelConfigPath)} and now.json exist in your project. Please use only one configuration method.`,
      'https://vercel.com/docs/projects/project-configuration'
    );
  }

  if (vercelConfigPath && hasVercelJson) {
    throw new ConflictingConfigFiles(
      [vercelConfigPath, vercelJsonPath],
      `Both ${basename(vercelConfigPath)} and vercel.json exist in your project. Please use only one configuration method.`,
      'https://vercel.com/docs/projects/project-configuration'
    );
  }

  if (!vercelConfigPath) {
    if (hasVercelJson) {
      return {
        configPath: vercelJsonPath,
        wasCompiled: false,
      };
    }

    if (hasNowJson) {
      return {
        configPath: nowJsonPath,
        wasCompiled: false,
      };
    }

    if (await fileExists(compiledConfigPath)) {
      return {
        configPath: compiledConfigPath,
        wasCompiled: true,
        sourceFile: (await findSourceVercelConfigFile(workPath)) ?? undefined,
      };
    }

    return {
      configPath: null,
      wasCompiled: false,
    };
  }

  dotenvConfig({ path: join(workPath, '.env') });
  dotenvConfig({ path: join(workPath, '.env.local') });

  const tempOutPath = join(vercelDir, 'vercel-temp.mjs');
  const loaderPath = join(vercelDir, 'vercel-loader.mjs');

  try {
    const { build } = await import('esbuild');

    await mkdir(vercelDir, { recursive: true });

    await build({
      entryPoints: [vercelConfigPath],
      bundle: true,
      platform: 'node',
      format: 'esm',
      outfile: tempOutPath,
      packages: 'external',
      target: 'node20',
      sourcemap: 'inline',
    });

    const loaderScript = `
      import { pathToFileURL } from 'url';
      const configModule = await import(pathToFileURL(process.argv[2]).href);
      const config = ('default' in configModule) ? configModule.default : ('config' in configModule) ? configModule.config : configModule;
      process.send(config);
    `;
    await writeFile(loaderPath, loaderScript, 'utf-8');

    const config = await new Promise<ConfigWithRouting>((resolve, reject) => {
      const child = fork(loaderPath, [tempOutPath], {
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      });

      let stderrOutput = '';
      let stdoutOutput = '';

      if (child.stderr) {
        child.stderr.on('data', data => {
          stderrOutput += data.toString();
        });
      }

      if (child.stdout) {
        child.stdout.on('data', data => {
          stdoutOutput += data.toString();
        });
      }

      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error('Config loader timed out after 10 seconds'));
      }, 10000);

      child.on('message', message => {
        clearTimeout(timeout);
        child.kill();
        resolve(message as ConfigWithRouting);
      });

      child.on('error', err => {
        clearTimeout(timeout);
        reject(err);
      });

      child.on('exit', code => {
        clearTimeout(timeout);
        if (code !== 0) {
          if (stderrOutput.trim()) {
            output.log(stderrOutput);
          }
          if (stdoutOutput.trim()) {
            output.log(stdoutOutput);
          }

          const parsedError = parseConfigLoaderError(stderrOutput);
          if (parsedError) {
            reject(new Error(parsedError));
          } else if (stdoutOutput.trim()) {
            reject(new Error(stdoutOutput.trim()));
          } else {
            reject(new Error(`Config loader exited with code ${code}`));
          }
        }
      });
    });

    const normalizedConfig = normalizeConfig(config);
    await writeFile(
      compiledConfigPath,
      JSON.stringify(normalizedConfig, null, 2),
      'utf-8'
    );

    output.debug(`Compiled ${vercelConfigPath} -> ${compiledConfigPath}`);

    return {
      configPath: compiledConfigPath,
      wasCompiled: true,
      sourceFile: (await findSourceVercelConfigFile(workPath)) ?? undefined,
    };
  } catch (error: any) {
    throw new NowBuildError({
      code: 'vercel_ts_compilation_failed',
      message: `Failed to compile ${vercelConfigPath}: ${error.message}`,
      link: 'https://vercel.com/docs/projects/project-configuration',
    });
  } finally {
    await Promise.all([
      unlink(tempOutPath).catch(err => {
        if (err.code !== 'ENOENT') {
          output.debug(`Failed to cleanup temp file: ${err}`);
        }
      }),
      unlink(loaderPath).catch(err => {
        if (err.code !== 'ENOENT') {
          output.debug(`Failed to cleanup loader file: ${err}`);
        }
      }),
    ]);
  }
}

export async function getVercelConfigPath(workPath: string): Promise<string> {
  const vercelJsonPath = join(workPath, 'vercel.json');
  const nowJsonPath = join(workPath, 'now.json');
  const compiledConfigPath = join(workPath, VERCEL_DIR, 'vercel.json');

  if (await fileExists(vercelJsonPath)) {
    return vercelJsonPath;
  }

  if (await fileExists(nowJsonPath)) {
    return nowJsonPath;
  }

  if (await fileExists(compiledConfigPath)) {
    return compiledConfigPath;
  }

  return nowJsonPath;
}
