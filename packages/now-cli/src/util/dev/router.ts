import url from 'url';
import PCRE from 'pcre-to-regexp';

import isURL from './is-url';
import DevServer from './server';

import { HttpHeadersConfig, RouteConfig, RouteResult } from './types';
import { isHandler, Route } from '@now/routing-utils';

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
    return match[matchIndex] || '';
  });
}

function getRoutesTypes(routes: Route[] = []) {
  const missRoutes: Route[] = [];
  const otherRoutes: Route[] = [];
  let isHandleMissPhase = false;

  for (const route of routes) {
    if (isHandler(route)) {
      isHandleMissPhase = route.handle === 'miss';
      if (isHandleMissPhase) {
        continue; // remove the `handle: miss`
      }
    }

    if (isHandleMissPhase) {
      missRoutes.push(route);
    } else {
      otherRoutes.push(route);
    }
  }

  return { missRoutes, otherRoutes };
}

export default async function router(
  reqUrl: string = '/',
  reqMethod?: string,
  routes?: RouteConfig[],
  devServer?: DevServer,
  phase?: string
): Promise<RouteResult> {
  let found: RouteResult | undefined;
  let { query, pathname: reqPathname = '/' } = url.parse(reqUrl, true);
  const combinedHeaders: HttpHeadersConfig = {};

  const { missRoutes, otherRoutes } = getRoutesTypes(routes);

  // Try route match
  if (otherRoutes) {
    let idx = -1;
    for (const routeConfig of otherRoutes) {
      idx++;
      if (isHandler(routeConfig)) {
        if (routeConfig.handle === 'filesystem' && devServer) {
          if (await devServer.hasFilesystem(reqPathname)) {
            break;
          }
        }
        continue;
      }

      let { src, headers, methods } = routeConfig;

      if (Array.isArray(methods) && reqMethod && !methods.includes(reqMethod)) {
        continue;
      }

      const keys: string[] = [];
      const matcher = PCRE(`%${src}%i`, keys);
      const match =
        matcher.exec(reqPathname) || matcher.exec(reqPathname.substring(1));

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

          Object.assign(combinedHeaders, headers);
        }

        if (routeConfig.continue) {
          reqPathname = destPath;
          continue;
        }

        if (routeConfig.check && devServer) {
          const { pathname = '/' } = url.parse(destPath);
          const hasDestFile = await devServer.hasFilesystem(pathname);
          // If the file is not found, `check: true` will
          // check the miss routes, otherwise
          // behave the same as `continue: true`
          if (!hasDestFile) {
            const result =
              phase !== 'miss'
                ? await router(reqUrl, reqMethod, missRoutes, devServer, 'miss')
                : null;
            if (result && result.found) {
              return result;
            } else {
              reqPathname = destPath;
              continue;
            }
          }
        }

        if (isURL(destPath)) {
          found = {
            found: true,
            dest: destPath,
            userDest: false,
            status: routeConfig.status,
            headers: combinedHeaders,
            uri_args: query,
            matched_route: routeConfig,
            matched_route_idx: idx,
          };
          break;
        } else {
          if (!destPath.startsWith('/')) {
            destPath = `/${destPath}`;
          }
          const { pathname, query } = url.parse(destPath, true);
          found = {
            found: true,
            dest: pathname || '/',
            userDest: Boolean(routeConfig.dest),
            status: routeConfig.status,
            headers: combinedHeaders,
            uri_args: query,
            matched_route: routeConfig,
            matched_route_idx: idx,
          };
          break;
        }
      }
    }
  }

  if (!found) {
    found = {
      found: false,
      dest: reqPathname,
      uri_args: query,
      headers: combinedHeaders,
    };
  }

  return found;
}
