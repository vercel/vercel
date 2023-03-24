import { existsSync, promises as fs } from 'fs';
import { join, relative, resolve } from 'path';
import { pathToRegexp, Key } from 'path-to-regexp';
import { spawnAsync } from '@vercel/build-utils';
import { readConfig } from '@remix-run/dev/dist/config';
import type {
  ConfigRoute,
  RouteManifest,
} from '@remix-run/dev/dist/config/routes';
import type { RemixConfig } from '@remix-run/dev/dist/config';
import type { BaseFunctionConfig } from '@vercel/static-config';
import type {
  CliType,
  SpawnOptionsExtended,
} from '@vercel/build-utils/dist/fs/run-user-scripts';

export interface ResolvedNodeRouteConfig {
  runtime: 'nodejs';
  regions?: string[];
  maxDuration?: number;
  memory?: number;
}
export interface ResolvedEdgeRouteConfig {
  runtime: 'edge';
  regions?: BaseFunctionConfig['regions'];
}

export type ResolvedRouteConfig =
  | ResolvedNodeRouteConfig
  | ResolvedEdgeRouteConfig;

export interface ResolvedRoutePaths {
  /**
   * The full URL path of the route, as will be shown
   * on the Functions tab in the deployment inspector.
   */
  path: string;
  /**
   * The full URL path of the route, but with syntax that
   * is compatible with the `path-to-regexp` module.
   */
  rePath: string;
}

const SPLAT_PATH = '/:params*';

const entryExts = ['.js', '.jsx', '.ts', '.tsx'];

export function findEntry(dir: string, basename: string): string | undefined {
  for (const ext of entryExts) {
    const file = resolve(dir, basename + ext);
    if (existsSync(file)) return relative(dir, file);
  }

  return undefined;
}

const configExts = ['.js', '.cjs', '.mjs'];

export function findConfig(dir: string, basename: string): string | undefined {
  for (const ext of configExts) {
    const name = basename + ext;
    const file = join(dir, name);
    if (existsSync(file)) return file;
  }

  return undefined;
}

function isEdgeRuntime(runtime: string): boolean {
  return runtime === 'edge' || runtime === 'experimental-edge';
}

export function getResolvedRouteConfig(
  route: ConfigRoute,
  routes: RouteManifest,
  configs: Map<ConfigRoute, BaseFunctionConfig | null>
): ResolvedRouteConfig {
  let runtime: ResolvedRouteConfig['runtime'] | undefined;
  let regions: ResolvedRouteConfig['regions'];
  let maxDuration: ResolvedNodeRouteConfig['maxDuration'];
  let memory: ResolvedNodeRouteConfig['memory'];

  for (const currentRoute of getRouteIterator(route, routes)) {
    const staticConfig = configs.get(currentRoute);
    if (staticConfig) {
      if (typeof runtime === 'undefined' && staticConfig.runtime) {
        runtime = isEdgeRuntime(staticConfig.runtime) ? 'edge' : 'nodejs';
      }
      if (typeof regions === 'undefined') {
        regions = staticConfig.regions;
      }
      if (typeof maxDuration === 'undefined') {
        maxDuration = staticConfig.maxDuration;
      }
      if (typeof memory === 'undefined') {
        memory = staticConfig.memory;
      }
    }
  }

  if (Array.isArray(regions)) {
    regions = Array.from(new Set(regions)).sort();
  }

  if (runtime === 'edge') {
    return { runtime, regions };
  }

  if (regions && !Array.isArray(regions)) {
    throw new Error(
      `"regions" for route "${route.id}" must be an array of strings`
    );
  }

  return { runtime: 'nodejs', regions, maxDuration, memory };
}

export function calculateRouteConfigHash(config: ResolvedRouteConfig): string {
  const str = JSON.stringify(config);
  return Buffer.from(str).toString('base64url');
}

export function isLayoutRoute(
  routeId: string,
  routes: Pick<ConfigRoute, 'id' | 'parentId'>[]
): boolean {
  return routes.some(r => r.parentId === routeId);
}

export function* getRouteIterator(route: ConfigRoute, routes: RouteManifest) {
  let currentRoute: ConfigRoute = route;
  do {
    yield currentRoute;
    if (currentRoute.parentId) {
      currentRoute = routes[currentRoute.parentId];
    } else {
      break;
    }
  } while (currentRoute);
}

export function getPathFromRoute(
  route: ConfigRoute,
  routes: RouteManifest
): ResolvedRoutePaths {
  if (
    route.id === 'root' ||
    (route.parentId === 'root' && !route.path && route.index)
  ) {
    return { path: 'index', rePath: '/index' };
  }

  const pathParts: string[] = [];
  const rePathParts: string[] = [];

  for (const currentRoute of getRouteIterator(route, routes)) {
    if (!currentRoute.path) continue;
    const currentRouteParts = currentRoute.path.split('/').reverse();
    for (const part of currentRouteParts) {
      if (part.endsWith('?')) {
        if (part.startsWith(':')) {
          // Optional path parameter
          pathParts.push(`(${part.substring(0, part.length - 1)})`);
          rePathParts.push(part);
        } else {
          // Optional static segment
          const p = `(${part.substring(0, part.length - 1)})`;
          pathParts.push(p);
          rePathParts.push(`${p}?`);
        }
      } else {
        pathParts.push(part);
        rePathParts.push(part);
      }
    }
  }

  const path = pathParts.reverse().join('/');

  // Replace "/*" at the end to handle "splat routes"
  let rePath = rePathParts.reverse().join('/');
  rePath =
    rePath === '*' ? SPLAT_PATH : `/${rePath.replace(/\/\*$/, SPLAT_PATH)}`;

  return { path, rePath };
}

export function getRegExpFromPath(rePath: string): RegExp | false {
  const keys: Key[] = [];
  const re = pathToRegexp(rePath, keys);
  return keys.length > 0 ? re : false;
}

/**
 * Updates the `dest` process.env object to match the `source` one.
 * A function is returned to restore the the `dest` env back to how
 * it was originally.
 */
export function syncEnv(source: NodeJS.ProcessEnv, dest: NodeJS.ProcessEnv) {
  const originalDest = { ...dest };
  Object.assign(dest, source);
  for (const key of Object.keys(dest)) {
    if (!(key in source)) {
      delete dest[key];
    }
  }

  return () => syncEnv(originalDest, dest);
}

export async function chdirAndReadConfig(dir: string, packageJsonPath: string) {
  const originalCwd = process.cwd();

  // As of Remix v1.14.0, reading the config may trigger adding
  // "isbot" as a dependency, and `npm`/`pnpm`/`yarn` may be invoked.
  // We want to prevent that behavior, so trick `readConfig()`
  // into thinking that "isbot" is already installed.
  let modifiedPackageJson = false;
  const pkgRaw = await fs.readFile(packageJsonPath, 'utf8');
  const pkg = JSON.parse(pkgRaw);
  if (!pkg.dependencies?.['isbot']) {
    pkg.dependencies.isbot = 'latest';
    await fs.writeFile(packageJsonPath, JSON.stringify(pkg));
    modifiedPackageJson = true;
  }

  let remixConfig: RemixConfig;
  try {
    process.chdir(dir);
    remixConfig = await readConfig(dir);
  } finally {
    process.chdir(originalCwd);
    if (modifiedPackageJson) {
      await fs.writeFile(packageJsonPath, pkgRaw);
    }
  }

  return remixConfig;
}

export interface AddDependencyOptions extends SpawnOptionsExtended {
  saveDev?: boolean;
}

/**
 * Runs `npm i ${name}` / `pnpm i ${name}` / `yarn add ${name}`.
 */
export function addDependency(
  cliType: CliType,
  names: string[],
  opts: AddDependencyOptions = {}
) {
  const args: string[] = [];
  if (cliType === 'npm' || cliType === 'pnpm') {
    args.push('install');
    if (opts.saveDev) {
      args.push('--save-dev');
    }
  } else {
    // 'yarn'
    args.push('add');
    if (opts.saveDev) {
      args.push('--dev');
    }
  }
  return spawnAsync(cliType, args.concat(names), opts);
}
