import { join } from 'path';
import { existsSync } from 'fs';
import { pathToRegexp, Key } from 'path-to-regexp';
import type {
  ConfigRoute,
  RouteManifest,
} from '@remix-run/dev/dist/config/routes';

const configExts = ['.js', '.cjs', '.mjs'];

export function findConfig(dir: string, basename: string): string | undefined {
  for (const ext of configExts) {
    const name = basename + ext;
    const file = join(dir, name);
    if (existsSync(file)) return file;
  }

  return undefined;
}

export function isLayoutRoute(
  routeId: string,
  routes: Pick<ConfigRoute, 'id' | 'parentId'>[]
): boolean {
  return routes.some(r => r.parentId === routeId);
}

export function getPathFromRoute(
  route: ConfigRoute,
  routes: RouteManifest
): string {
  let currentRoute: ConfigRoute | undefined = route;
  const pathParts: string[] = [];
  do {
    if (currentRoute.index) pathParts.push('index');
    if (currentRoute.path) pathParts.push(currentRoute.path);
    if (currentRoute.parentId) {
      currentRoute = routes[currentRoute.parentId];
    } else {
      currentRoute = undefined;
    }
  } while (currentRoute);
  const path = pathParts.reverse().join('/');
  return path;
}

export function getRegExpFromPath(path: string): RegExp | false {
  const keys: Key[] = [];
  // Replace "/*" at the end to handle "splat routes"
  const splatPath = '/:params+';
  const rePath =
    path === '*' ? splatPath : `/${path.replace(/\/\*$/, splatPath)}`;
  const re = pathToRegexp(rePath, keys);
  return keys.length > 0 ? re : false;
}
