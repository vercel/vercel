import http from 'http'
import url from 'url'
import qs from 'querystring'

import {
  BuilderOutputs,
  RouteConfig,
  RouteResult
} from './types';

export default function (
  req: http.IncomingMessage,
  assets: BuilderOutputs,
  routes?: RouteConfig[]
): RouteResult | void {
  const { pathname, query } = url.parse(req.url as string);
  const queryParams = qs.parse(query || '');
  const pathName = pathname || '';

  let found: RouteResult | undefined;

  // try route match
  if (routes) {
    routes.find((routeConfig: RouteConfig, idx:number) => {
      const matcher = new RegExp('^' + routeConfig.src + '$');

      if (matcher.test(pathName)) {
        found = {
          dest: resolveDest(assets, routeConfig.dest),
          status: routeConfig.status,
          headers: routeConfig.headers,
          uri_args: queryParams,
          matched_route: routeConfig,
          matched_route_idx: idx
        }
        return true;
      }

      return false;
    });
  }

  // try assets match
  if (found === undefined) {
    const handler = resolveDest(assets, pathName.replace(/^\//, ''));

    if (handler) {
      found = {
        dest: handler,
        uri_args: queryParams
      }
    }
  }

  return found
}

/**
 * Find the right handler from assets
 *
 * @param assets Avaliable lambdas or static files
 * @param dest the dest asked by request
 */
function resolveDest (assets: BuilderOutputs, dest: string) {
  // if `dest` is a url
  if (/^https?:\/\//.test(dest)) return dest;

  // TODO: more cases, go, rust, php, etc.
  return assets[dest]
  || assets[dest + "index.js"]
  || assets[dest + "/index.js"]
  || assets[dest + "/index.html"];
}
