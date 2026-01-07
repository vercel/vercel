import url from 'url';
import http from 'http';
import PCRE from 'pcre-to-regexp';

import isURL from './is-url';
import type DevServer from './server';

import type { VercelConfig, HttpHeadersConfig, RouteResult } from './types';
import {
  isHandler,
  type Route,
  type HandleValue,
  type HasField,
} from '@vercel/routing-utils';
import { parseQueryString } from './parse-query-string';

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

/**
 * Check if a single "has" or "missing" condition matches the request.
 * Returns { matched: boolean, captures: Record<string, string> }
 */
function checkCondition(
  condition: HasField[number],
  req: http.IncomingMessage,
  reqQuery: Record<string, string[]>
): { matched: boolean; captures: Record<string, string> } {
  const captures: Record<string, string> = {};

  if (condition.type === 'host') {
    const hostHeader = req.headers.host || '';
    const value =
      typeof condition.value === 'string' ? condition.value : condition.value?.eq?.toString() || '.*';
    try {
      const regex = new RegExp(`^${value}$`);
      const match = regex.exec(hostHeader);
      if (match) {
        // Extract named captures
        if (match.groups) {
          Object.assign(captures, match.groups);
        }
        return { matched: true, captures };
      }
    } catch {
      // Invalid regex, treat as literal match
      if (hostHeader === value) {
        return { matched: true, captures };
      }
    }
    return { matched: false, captures };
  }

  if (condition.type === 'header') {
    const headerValue = req.headers[condition.key.toLowerCase()];
    if (condition.value === undefined) {
      // Just check presence
      return { matched: headerValue !== undefined, captures };
    }
    const value =
      typeof condition.value === 'string' ? condition.value : condition.value?.eq?.toString() || '';
    const headerStr = Array.isArray(headerValue) ? headerValue.join(', ') : headerValue || '';
    try {
      const regex = new RegExp(`^${value}$`);
      const match = regex.exec(headerStr);
      if (match) {
        if (match.groups) {
          Object.assign(captures, match.groups);
        }
        return { matched: true, captures };
      }
    } catch {
      if (headerStr === value) {
        return { matched: true, captures };
      }
    }
    return { matched: false, captures };
  }

  if (condition.type === 'cookie') {
    const cookieHeader = req.headers.cookie || '';
    const cookies: Record<string, string> = {};
    cookieHeader.split(';').forEach(part => {
      const [key, val] = part.trim().split('=');
      if (key) cookies[key] = val || '';
    });
    const cookieValue = cookies[condition.key];
    if (condition.value === undefined) {
      return { matched: cookieValue !== undefined, captures };
    }
    const value =
      typeof condition.value === 'string' ? condition.value : condition.value?.eq?.toString() || '';
    try {
      const regex = new RegExp(`^${value}$`);
      const match = regex.exec(cookieValue || '');
      if (match) {
        if (match.groups) {
          Object.assign(captures, match.groups);
        }
        return { matched: true, captures };
      }
    } catch {
      if (cookieValue === value) {
        return { matched: true, captures };
      }
    }
    return { matched: false, captures };
  }

  if (condition.type === 'query') {
    const queryValue = reqQuery[condition.key]?.[0];
    if (condition.value === undefined) {
      return { matched: queryValue !== undefined, captures };
    }
    const value =
      typeof condition.value === 'string' ? condition.value : condition.value?.eq?.toString() || '';
    try {
      const regex = new RegExp(`^${value}$`);
      const match = regex.exec(queryValue || '');
      if (match) {
        if (match.groups) {
          Object.assign(captures, match.groups);
        }
        return { matched: true, captures };
      }
    } catch {
      if (queryValue === value) {
        return { matched: true, captures };
      }
    }
    return { matched: false, captures };
  }

  return { matched: false, captures };
}

/**
 * Check all "has" conditions - all must match
 */
function checkHasConditions(
  has: HasField | undefined,
  req: http.IncomingMessage,
  reqQuery: Record<string, string[]>
): { matched: boolean; captures: Record<string, string> } {
  if (!has || has.length === 0) {
    return { matched: true, captures: {} };
  }

  const allCaptures: Record<string, string> = {};
  for (const condition of has) {
    const result = checkCondition(condition, req, reqQuery);
    if (!result.matched) {
      return { matched: false, captures: {} };
    }
    Object.assign(allCaptures, result.captures);
  }
  return { matched: true, captures: allCaptures };
}

/**
 * Check all "missing" conditions - all must NOT match (i.e., all must be absent)
 */
function checkMissingConditions(
  missing: HasField | undefined,
  req: http.IncomingMessage,
  reqQuery: Record<string, string[]>
): boolean {
  if (!missing || missing.length === 0) {
    return true;
  }

  for (const condition of missing) {
    const result = checkCondition(condition, req, reqQuery);
    if (result.matched) {
      return false; // Found something that should be missing
    }
  }
  return true;
}

/**
 * Extract request headers from transforms
 */
function extractTransformHeaders(
  transforms: Route['transforms'] | undefined,
  pathMatch: string[],
  pathKeys: string[],
  hasCaptures: Record<string, string>,
  envValues: Record<string, string>
): { requestHeaders: HttpHeadersConfig; responseHeaders: HttpHeadersConfig } {
  const requestHeaders: HttpHeadersConfig = {};
  const responseHeaders: HttpHeadersConfig = {};

  if (!transforms) {
    return { requestHeaders, responseHeaders };
  }

  for (const transform of transforms) {
    if (transform.op !== 'set') {
      // For now, only support 'set' operation
      continue;
    }

    const targetKey =
      typeof transform.target.key === 'string' ? transform.target.key : null;
    if (!targetKey) continue;

    let value = Array.isArray(transform.args)
      ? transform.args[0]
      : transform.args || '';

    // Resolve path parameters ($1, $2, etc. and $paramName)
    value = resolveRouteParameters(value, pathMatch, pathKeys);

    // Resolve has captures ($host, etc.)
    value = value.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => {
      if (hasCaptures[name] !== undefined) {
        return hasCaptures[name];
      }
      // Check env values
      if (envValues[name] !== undefined) {
        return envValues[name];
      }
      return `$${name}`;
    });

    if (transform.type === 'request.headers') {
      requestHeaders[targetKey] = value;
    } else if (transform.type === 'response.headers') {
      responseHeaders[targetKey] = value;
    }
  }

  return { requestHeaders, responseHeaders };
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

export interface DevRouterOptions {
  reqUrl?: string;
  reqMethod?: string;
  routes?: Route[];
  devServer?: DevServer;
  vercelConfig?: VercelConfig;
  previousHeaders?: HttpHeadersConfig;
  missRoutes?: Route[];
  phase?: HandleValue | null;
  // New options for has/missing/transforms support
  req?: http.IncomingMessage;
  envValues?: Record<string, string>;
}

export async function devRouter(
  reqUrl: string = '/',
  reqMethod?: string,
  routes?: Route[],
  devServer?: DevServer,
  vercelConfig?: VercelConfig,
  previousHeaders?: HttpHeadersConfig,
  missRoutes?: Route[],
  phase?: HandleValue | null,
  req?: http.IncomingMessage,
  envValues?: Record<string, string>
): Promise<RouteResult> {
  let result: RouteResult | undefined;
  // eslint-disable-next-line prefer-const
  let { pathname: reqPathname, search: reqSearch } = url.parse(reqUrl);
  reqPathname = reqPathname || '/';
  const reqQuery = parseQueryString(reqSearch);
  const combinedHeaders: HttpHeadersConfig = { ...previousHeaders };
  const combinedRequestHeaders: HttpHeadersConfig = {};
  let status: number | undefined;
  let isContinue = false;

  // Try route match
  if (routes) {
    let idx = -1;
    for (const routeConfig of routes) {
      idx++;
      isContinue = false;

      if (isHandler(routeConfig)) {
        // We don't expect any Handle, only Source routes
        continue;
      }

      const { src, headers, methods } = routeConfig;

      if (Array.isArray(methods) && reqMethod && !methods.includes(reqMethod)) {
        continue;
      }

      const keys: string[] = [];
      const flags = devServer && devServer.isCaseSensitive() ? '' : 'i';
      const matcher = PCRE(`%${src}%${flags}`, keys);
      const match =
        matcher.exec(reqPathname) || matcher.exec(reqPathname.substring(1));

      if (match) {
        // Check has conditions (all must match)
        let hasCaptures: Record<string, string> = {};
        if (routeConfig.has && req) {
          const hasResult = checkHasConditions(routeConfig.has, req, reqQuery);
          if (!hasResult.matched) {
            continue; // has conditions not met, skip this route
          }
          hasCaptures = hasResult.captures;
        }

        // Check missing conditions (all must be absent)
        if (routeConfig.missing && req) {
          if (!checkMissingConditions(routeConfig.missing, req, reqQuery)) {
            continue; // missing conditions not met, skip this route
          }
        }

        let destPath: string = reqPathname;

        if (routeConfig.dest) {
          destPath = resolveRouteParameters(routeConfig.dest, match, keys);
          // Also resolve has captures in dest
          destPath = destPath.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (full, name) => {
            if (hasCaptures[name] !== undefined) {
              return hasCaptures[name];
            }
            if (envValues && envValues[name] !== undefined) {
              return envValues[name];
            }
            return full;
          });
        }

        // Extract transforms for request/response headers
        if (routeConfig.transforms) {
          const transformResult = extractTransformHeaders(
            routeConfig.transforms,
            match,
            keys,
            hasCaptures,
            envValues || {}
          );
          Object.assign(combinedRequestHeaders, transformResult.requestHeaders);
          // Add response headers from transforms to combinedHeaders
          for (const [key, value] of Object.entries(transformResult.responseHeaders)) {
            combinedHeaders[key.toLowerCase()] = value;
          }
        }

        if (headers) {
          for (const originalKey of Object.keys(headers)) {
            const lowerKey = originalKey.toLowerCase();
            if (
              previousHeaders &&
              Object.prototype.hasOwnProperty.call(previousHeaders, lowerKey) &&
              (phase === 'hit' || phase === 'miss')
            ) {
              // don't override headers in the hit or miss phase
            } else {
              const originalValue = headers[originalKey];
              let value = resolveRouteParameters(originalValue, match, keys);
              // Also resolve has captures
              value = value.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (full, name) => {
                if (hasCaptures[name] !== undefined) {
                  return hasCaptures[name];
                }
                if (envValues && envValues[name] !== undefined) {
                  return envValues[name];
                }
                return full;
              });
              combinedHeaders[lowerKey] = value;
            }
          }
        }

        if (routeConfig.continue) {
          if (routeConfig.status) {
            status = routeConfig.status;
          }
          reqPathname = destPath;
          isContinue = true;
          continue;
        }

        // if the destination is an external URL (rewrite or redirect)
        const isDestUrl = isURL(destPath);

        if (
          routeConfig.check &&
          devServer &&
          vercelConfig &&
          phase !== 'hit' &&
          !isDestUrl
        ) {
          let { pathname } = url.parse(destPath);
          pathname = pathname || '/';
          const hasDestFile = await devServer.hasFilesystem(
            pathname,
            vercelConfig
          );

          if (!hasDestFile) {
            if (routeConfig.status && phase !== 'miss') {
              // Equivalent to now-proxy exit_with_status() function
            } else if (missRoutes && missRoutes.length > 0) {
              // Trigger a 'miss'
              const missResult = await devRouter(
                destPath,
                reqMethod,
                missRoutes,
                devServer,
                vercelConfig,
                combinedHeaders,
                [],
                'miss',
                req,
                envValues
              );
              if (missResult.found) {
                return missResult;
              } else {
                reqPathname = destPath;
                continue;
              }
            } else {
              if (routeConfig.status && phase === 'miss') {
                status = routeConfig.status;
              }
              reqPathname = destPath;
              continue;
            }
          }
        }

        if (isDestUrl) {
          result = {
            found: true,
            dest: destPath,
            continue: isContinue,
            userDest: false,
            isDestUrl,
            status: routeConfig.status || status,
            headers: combinedHeaders,
            requestHeaders: Object.keys(combinedRequestHeaders).length > 0 ? combinedRequestHeaders : undefined,
            query: reqQuery,
            matched_route: routeConfig,
            matched_route_idx: idx,
            phase,
          };
          break;
        } else {
          if (!destPath.startsWith('/')) {
            destPath = `/${destPath}`;
          }
          // eslint-disable-next-line prefer-const
          let { pathname: destPathname, search: destSearch } =
            url.parse(destPath);
          destPathname = destPathname || '/';
          const destQuery = parseQueryString(destSearch);
          Object.assign(destQuery, reqQuery);
          result = {
            found: true,
            dest: destPathname,
            continue: isContinue,
            userDest: Boolean(routeConfig.dest),
            isDestUrl,
            status: routeConfig.status || status,
            headers: combinedHeaders,
            requestHeaders: Object.keys(combinedRequestHeaders).length > 0 ? combinedRequestHeaders : undefined,
            query: destQuery,
            matched_route: routeConfig,
            matched_route_idx: idx,
            phase,
          };
          break;
        }
      }
    }
  }

  if (!result) {
    result = {
      found: false,
      dest: reqPathname,
      continue: isContinue,
      status,
      isDestUrl: false,
      query: reqQuery,
      headers: combinedHeaders,
      phase,
    };
  }

  return result;
}
