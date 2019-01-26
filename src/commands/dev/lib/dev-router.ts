import http from 'http'
import url from 'url'
import qs from 'querystring'

import {
  RouteConfig,
  RouteResult
} from './types';

export default function (
  req: http.IncomingMessage,
  routes?: RouteConfig[]
): RouteResult {
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
          dest: routeConfig.dest,
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

  if (found === undefined) {
    found = {
      dest: pathname || '',
      uri_args: queryParams
    };
  }

  return found;
}
