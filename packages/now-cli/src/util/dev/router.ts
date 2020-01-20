import url from 'url';
import PCRE from 'pcre-to-regexp';

import isURL from './is-url';
import DevServer from './server';

import { HttpHeadersConfig, RouteConfig, RouteResult } from './types';
import { isHandler, Route, HandleValue } from '@now/routing-utils';

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

export function getRoutesTypes(routes: Route[] = []) {
  const handleMap = new Map<HandleValue | null, Route[]>();
  let prevHandle: HandleValue | null = null;
  routes.forEach(route => {
    if (isHandler(route)) {
      prevHandle = route.handle;
    } else {
      const routes = handleMap.get(prevHandle);
      if (!routes) {
        handleMap.set(prevHandle, [route]);
      } else {
        routes.push(route);
      }
    }
  });

  return handleMap;
}

export async function devRouter(
  reqUrl: string = '/',
  reqMethod?: string,
  routes?: RouteConfig[],
  devServer?: DevServer,
  previousHeaders?: HttpHeadersConfig,
  missRoutes?: RouteConfig[],
  phase?: HandleValue | null
): Promise<RouteResult> {
  let found: RouteResult | undefined;
  let { query, pathname: reqPathname = '/' } = url.parse(reqUrl, true);
  const combinedHeaders: HttpHeadersConfig = { ...previousHeaders };

  // Try route match
  if (routes) {
    let idx = -1;
    for (const routeConfig of routes) {
      idx++;

      if (isHandler(routeConfig)) {
        // We don't expect any Handle, only Source routes
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
          for (const key of Object.keys(headers)) {
            if (
              previousHeaders &&
              // eslint-disable-next-line no-prototype-builtins
              previousHeaders.hasOwnProperty(key) &&
              (phase === 'hit' || phase === 'miss')
            ) {
              // don't override headers in the miss phase
            } else {
              const value = resolveRouteParameters(headers[key], match, keys);
              combinedHeaders[key.toLowerCase()] = value;
            }
          }
        }

        if (routeConfig.continue) {
          if (phase === 'miss' && routeConfig.status === 404) {
            // Don't continue on miss route so that 404 works
          } else {
            reqPathname = destPath;
            continue;
          }
        }

        if (routeConfig.check && devServer && phase !== 'hit') {
          const { pathname = '/' } = url.parse(destPath);
          const hasDestFile = await devServer.hasFilesystem(pathname);
          if (!hasDestFile) {
            if (missRoutes && missRoutes.length > 0) {
              // Trigger a 'miss'
              const missResult = await devRouter(
                destPath,
                reqMethod,
                missRoutes,
                devServer,
                previousHeaders,
                [],
                'miss'
              );
              if (missResult.found) {
                return missResult;
              }
            } else {
              reqPathname = destPath;
              continue;
            }
          }
        }

        const isDestUrl = isURL(destPath);
        if (isDestUrl) {
          found = {
            found: true,
            dest: destPath,
            userDest: false,
            isDestUrl,
            status: routeConfig.status,
            headers: combinedHeaders,
            uri_args: query,
            matched_route: routeConfig,
            matched_route_idx: idx,
            phase,
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
            isDestUrl,
            status: routeConfig.status,
            headers: combinedHeaders,
            uri_args: query,
            matched_route: routeConfig,
            matched_route_idx: idx,
            phase,
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
      isDestUrl: false,
      uri_args: query,
      headers: combinedHeaders,
    };
  }

  return found;
}
