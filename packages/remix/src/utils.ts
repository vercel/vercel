import semver from 'semver';
import { existsSync, readFileSync, promises as fs } from 'fs';
import { basename, dirname, join, relative, resolve, sep } from 'path';
import { pathToRegexp, Key } from 'path-to-regexp';
import { debug, type PackageJson } from '@vercel/build-utils';
import { walkParentDirs } from '@vercel/build-utils';
import { createRequire } from 'module';
import type {
  ConfigRoute,
  RouteManifest,
} from '@remix-run/dev/dist/config/routes';
import type { RemixConfig } from '@remix-run/dev/dist/config';
import type { BaseFunctionConfig } from '@vercel/static-config';

export const require_ = createRequire(__filename);

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

export function findConfig(
  dir: string,
  basename: string,
  exts = configExts
): string | undefined {
  for (const ext of exts) {
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
  configs: Map<ConfigRoute, BaseFunctionConfig | null>,
  isHydrogen2: boolean
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

  if (isHydrogen2 || runtime === 'edge') {
    return { runtime: 'edge', regions };
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
    (route.parentId === 'root' &&
      (!route.path || route.path === '/') &&
      route.index)
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

export async function chdirAndReadConfig(
  remixRunDevPath: string,
  dir: string,
  packageJsonPath: string
) {
  const { readConfig }: typeof import('@remix-run/dev/dist/config') =
    await import(join(remixRunDevPath, 'dist/config.js'));

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

  // Suppress any warnings emitted from `readConfig()` to avoid
  // printing them > 1 time. They will already be printed during
  // `remix build` when invoking the Build Command.
  const warn = console.warn;
  console.warn = debug;

  let remixConfig: RemixConfig;
  try {
    process.chdir(dir);
    remixConfig = await readConfig(dir);
  } finally {
    console.warn = warn;
    process.chdir(originalCwd);
    if (modifiedPackageJson) {
      await fs.writeFile(packageJsonPath, pkgRaw);
    }
  }

  return remixConfig;
}

export function resolveSemverMinMax(
  min: string,
  max: string,
  version: string
): string {
  const floored = semver.intersects(version, `>= ${min}`) ? version : min;
  return semver.intersects(floored, `<= ${max}`) ? floored : max;
}

export async function ensureResolvable(
  start: string,
  base: string,
  pkgName: string
): Promise<string> {
  try {
    const resolvedPkgPath = require_.resolve(`${pkgName}/package.json`, {
      paths: [start],
    });
    const resolvedPath = dirname(resolvedPkgPath);
    if (!relative(base, resolvedPath).startsWith(`..${sep}`)) {
      // Resolved path is within the root of the project, so all good
      debug(`"${pkgName}" resolved to '${resolvedPath}'`);
      return resolvedPath;
    }
  } catch (err: any) {
    if (err.code !== 'MODULE_NOT_FOUND') {
      throw err;
    }
  }

  // If we got to here then `pkgName` was not resolvable up to the root
  // of the project. Try a couple symlink tricks, otherwise we'll bail.

  // Attempt to find the package in `node_modules/.pnpm` (pnpm)
  const pnpmDir = await walkParentDirs({
    base,
    start,
    filename: 'node_modules/.pnpm',
  });
  if (pnpmDir) {
    const prefix = `${pkgName.replace('/', '+')}@`;
    const packages = await fs.readdir(pnpmDir);
    const match = packages.find(p => p.startsWith(prefix));
    if (match) {
      const pkgDir = join(pnpmDir, match, 'node_modules', pkgName);
      await ensureSymlink(pkgDir, join(start, 'node_modules'), pkgName);
      return pkgDir;
    }
  }

  // Attempt to find the package in `node_modules/.store` (npm 9+ linked mode)
  const npmDir = await walkParentDirs({
    base,
    start,
    filename: 'node_modules/.store',
  });
  if (npmDir) {
    const prefix = `${basename(pkgName)}@`;
    const prefixDir = join(npmDir, dirname(pkgName));
    const packages = await fs.readdir(prefixDir);
    const match = packages.find(p => p.startsWith(prefix));
    if (match) {
      const pkgDir = join(prefixDir, match, 'node_modules', pkgName);
      await ensureSymlink(pkgDir, join(start, 'node_modules'), pkgName);
      return pkgDir;
    }
  }

  throw new Error(
    `Failed to resolve "${pkgName}". To fix this error, add "${pkgName}" to "dependencies" in your \`package.json\` file.`
  );
}

async function ensureSymlink(
  target: string,
  nodeModulesDir: string,
  pkgName: string
) {
  const symlinkPath = join(nodeModulesDir, pkgName);
  const symlinkDir = dirname(symlinkPath);
  const relativeTarget = relative(symlinkDir, target);

  try {
    const existingTarget = await fs.readlink(symlinkPath);
    if (existingTarget === relativeTarget) {
      // Symlink is already the expected value, so do nothing
      return;
    } else {
      // If a symlink already exists then delete it if the target doesn't match
      await fs.unlink(symlinkPath);
    }
  } catch (err: any) {
    // Ignore when path does not exist or is not a symlink
    if (err.code !== 'ENOENT' && err.code !== 'EINVAL') {
      throw err;
    }
  }

  await fs.mkdir(symlinkDir, { recursive: true });
  await fs.symlink(relativeTarget, symlinkPath);
  debug(`Created symlink for "${pkgName}"`);
}

export function isESM(path: string): boolean {
  // Figure out if the `remix.config` file is using ESM syntax
  let isESM = false;
  try {
    require_(path);
  } catch (err: any) {
    isESM = err.code === 'ERR_REQUIRE_ESM';
  }
  return isESM;
}

export function hasScript(scriptName: string, pkg?: PackageJson) {
  const scripts = pkg?.scripts || {};
  return typeof scripts[scriptName] === 'string';
}

export async function getRemixVersion(
  dir: string,
  base: string
): Promise<string> {
  const resolvedPath = require_.resolve('@remix-run/dev', { paths: [dir] });
  const pkgPath = await walkParentDirs({
    base,
    start: dirname(resolvedPath),
    filename: 'package.json',
  });
  if (!pkgPath) {
    throw new Error(
      `Failed to find \`package.json\` file for "@remix-run/dev"`
    );
  }
  const { version } = JSON.parse(
    await fs.readFile(pkgPath, 'utf8')
  ) as PackageJson;
  if (typeof version !== 'string') {
    throw new Error(`Missing "version" field`);
  }
  return version;
}

export function logNftWarnings(warnings: Set<Error>, required?: string) {
  for (const warning of warnings) {
    const m = warning.message.match(/^Failed to resolve dependency "(.+)"/);
    if (m) {
      if (m[1] === required) {
        throw new Error(
          `Missing required "${required}" package. Please add it to your \`package.json\` file.`
        );
      } else {
        console.warn(`WARN: ${m[0]}`);
      }
    } else {
      debug(`Warning from trace: ${warning.message}`);
    }
  }
}

export function isVite(dir: string): boolean {
  const viteConfig = findConfig(dir, 'vite.config', [
    '.js',
    '.ts',
    '.mjs',
    '.mts',
  ]);
  if (!viteConfig) return false;

  const remixConfig = findConfig(dir, 'remix.config');
  if (!remixConfig) return true;

  // `remix.config` and `vite.config` exist, so check a couple other ways

  // Is `vite:build` found in the `package.json` "build" script?
  const pkg: PackageJson = JSON.parse(
    readFileSync(join(dir, 'package.json'), 'utf8')
  );
  if (pkg.scripts?.build && /\bvite:build\b/.test(pkg.scripts.build)) {
    return true;
  }

  // Is `@remix-run/dev` package found in `vite.config`?
  const viteConfigContents = readFileSync(viteConfig, 'utf8');
  if (/['"]@remix-run\/dev['"]/.test(viteConfigContents)) {
    return true;
  }

  // If none of those conditions matched, then treat it as a legacy project and print a warning
  return false;
}
