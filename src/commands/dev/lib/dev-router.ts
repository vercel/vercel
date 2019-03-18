import url from 'url';
import qs from 'querystring';

import isURL from './is-url';

import { RouteConfig, RouteResult } from './types';

export default function(reqPath = '', routes?: RouteConfig[]): RouteResult {
  let found: RouteResult | undefined;
  const { pathname: reqPathname = '/' } = url.parse(reqPath);

  // try route match
  if (routes) {
    routes.find((routeConfig: RouteConfig, idx: number) => {
      const matcher = new RegExp('^' + routeConfig.src + '$');

      if (matcher.test(reqPathname)) {
        const destPath = routeConfig.dest
          ? reqPathname.replace(matcher, routeConfig.dest)
          : reqPathname;

        if (isURL(destPath)) {
          found = {
            dest: destPath,
            status: routeConfig.status,
            headers: routeConfig.headers,
            uri_args: {},
            matched_route: routeConfig,
            matched_route_idx: idx
          };
        } else {
          const { pathname, query } = url.parse(destPath);
          const queryParams = qs.parse(query || '');
          found = {
            dest: pathname || '/',
            status: routeConfig.status,
            headers: routeConfig.headers,
            uri_args: queryParams,
            matched_route: routeConfig,
            matched_route_idx: idx
          };
        }

        return true;
      }

      return false;
    });
  }

  if (!found) {
    const { query } = url.parse(reqPath);
    const queryParams = qs.parse(query || '');

    found = {
      dest: reqPathname,
      uri_args: queryParams
    };
  }

  return found;
}
