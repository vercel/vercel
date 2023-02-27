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
): string {
  if (route.id === 'root' || (route.parentId === 'root' && route.index)) {
    return 'index';
  }

  const pathParts: string[] = [];
  for (const currentRoute of getRouteIterator(route, routes)) {
    if (currentRoute.path) pathParts.push(currentRoute.path);
  }
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
