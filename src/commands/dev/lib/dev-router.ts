import url from 'url';
import qs from 'querystring';

import { RouteConfig, RouteResult } from './types';

export default function(
  reqPath = '',
  routes?: RouteConfig[]
): RouteResult {
  let found: RouteResult | undefined;

  // try route match
  if (routes) {
    routes.find((routeConfig: RouteConfig, idx: number) => {
      const matcher = new RegExp('^' + routeConfig.src + '$');

      if (matcher.test(reqPath)) {
        const destPath = reqPath.replace(matcher, routeConfig.dest);
        const { query } = url.parse(destPath);
        const queryParams = qs.parse(query || '');

        found = {
          dest: destPath,
          status: routeConfig.status,
          headers: routeConfig.headers,
          uri_args: queryParams,
          matched_route: routeConfig,
          matched_route_idx: idx
        };
        return true;
      }

      return false;
    });
  }

  if (found === undefined) {
    const { query } = url.parse(reqPath);
    const queryParams = qs.parse(query || '');

    found = {
      dest: reqPath,
      uri_args: queryParams
    };
  }

  return found;
}
