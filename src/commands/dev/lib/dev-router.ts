import url from 'url';
import qs from 'querystring';
import PCRE from 'pcre-to-regexp';

import isURL from './is-url';

import { RouteConfig, RouteResult } from './types';

export default function(reqPath = '', routes?: RouteConfig[]): RouteResult {
  let found: RouteResult | undefined;
  const { pathname: reqPathname = '/' } = url.parse(reqPath);

  const resolveRouteParameters = (str: string, dict: {keys: string[], match: string[]}) => {
    return str.replace(
      /\$([1-9a-zA-Z]+)/g,
      (_, param) => {
        let matchIndex: number = dict.keys.indexOf(param);
        if (matchIndex === -1) {
          // It's a number match, not a named capture
          matchIndex = parseInt(param, 10);
        } else {
          // For named captures, add one to the `keys` index to
          // match up with the RegExp group matches
          matchIndex++;
        }
        return dict.match[matchIndex];
      }
    );

  }

  // try route match
  if (routes) {
    routes.find((routeConfig: RouteConfig, idx: number) => {
      let { src } = routeConfig;
      if (!src) {
        // ignore { "handler" } routes for now
        return false;
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
        let { headers } = routeConfig;

        if (headers) {
          Object.keys(headers).map((key)=>{
            if (headers)
              headers = { ...headers, [key]: resolveRouteParameters(headers[key], {match, keys})};
          });
        }
        

        if (routeConfig.dest) {
          destPath = resolveRouteParameters(routeConfig.dest, {match, keys})
        }
        
        

        if (isURL(destPath)) {
          found = {
            dest: destPath,
            status: routeConfig.status,
            headers,
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
            headers,
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
