import { join } from 'path';
import { existsSync } from 'fs';
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
  route: ConfigRoute,
  routes: ConfigRoute[]
): boolean {
  return routes.some(r => r.parentId === route.id);
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
  const path = join(...pathParts.reverse());
  return path;
}
