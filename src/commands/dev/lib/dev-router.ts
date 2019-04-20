import url from 'url';
import PCRE from 'pcre-to-regexp';

import isURL from './is-url';
import DevServer from './dev-server';

import { BuilderInputs, RouteConfig, RouteResult } from './types';

export function resolveRouteParameters(
  str: string,
  match: string[],
  keys: string[]
): string {
  return str.replace(/\$([1-9a-zA-Z]+)/g, (_, param) => {
    let matchIndex: number = keys.indexOf(param);
    if (matchIndex === -1) {
      // It's a number match, not a named capture
      matchIndex = parseInt(param, 10);
    } else {
      // For named captures, add one to the `keys` index to
      // match up with the RegExp group matches
      matchIndex++;
    }
    return match[matchIndex];
  });
}

function mergeRoutes(
  existing: RouteResult | undefined,
  fresh: RouteResult
): RouteResult {
  if (!existing) {
    return fresh;
  }

  return {
    dest: fresh.userDest ? fresh.dest : (existing.dest || fresh.dest),
    status: fresh.status || existing.status,
    headers: fresh.headers || existing.headers,
    uri_args: fresh.uri_args || existing.uri_args || {},
    matched_route: fresh.matched_route,
    matched_route_idx: fresh.matched_route_idx
  };
}

export default async function(
  reqPath = '',
  routes?: RouteConfig[],
  devServer?: DevServer
): Promise<RouteResult> {
  let found: RouteResult | undefined;
  const { query, pathname: reqPathname = '/' } = url.parse(reqPath, true);

  // try route match
  if (routes) {
    let idx = -1;
    for (const routeConfig of routes) {
      idx++;
      let { src, headers, handle } = routeConfig;
      if (handle) {
        if (handle === 'filesystem' && devServer) {
          if (await devServer.hasFilesystem(reqPathname)) {
            break;
          }
        }
        continue;
      }

      if (!src.startsWith('^')) {
        src = `^${src}`;
      }

      if (!src.endsWith('$')) {
        src = `${src}$`;
      }

      const keys: string[] = [];
      const matcher = PCRE(`%${src}%i`, keys);
      const match = matcher.exec(reqPathname);

      if (match) {
        let destPath: string = reqPathname;

        if (routeConfig.dest) {
          destPath = resolveRouteParameters(routeConfig.dest, match, keys);
        }

        if (headers) {
          // Create a clone of the `headers` object to not mutate the original one
          headers = { ...headers };
          for (const key of Object.keys(headers)) {
            headers[key] = resolveRouteParameters(headers[key], match, keys);
          }
        }

        if (isURL(destPath)) {
          found = mergeRoutes(found, {
            dest: destPath,
            userDest: false,
            status: routeConfig.status,
            headers,
            uri_args: {},
            matched_route: routeConfig,
            matched_route_idx: idx
          });
        } else {
          const { pathname, query } = url.parse(destPath, true);

          found = mergeRoutes(found, {
            dest: pathname || '/',
            userDest: Boolean(routeConfig.dest),
            status: routeConfig.status,
            headers,
            uri_args: query,
            matched_route: routeConfig,
            matched_route_idx: idx
          });
        }
      }
    }
  }

  if (!found) {
    found = {
      dest: reqPathname,
      uri_args: query
    };
  }

  return found;
}
