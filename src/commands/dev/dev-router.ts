import http from 'http'
import url from 'url'
import qs from 'querystring'

// @ts-ignore
import FileFsRef from '@now/build-utils/file-fs-ref';
// @ts-ignore
import Lambda from '@now/build-utils/lambda'

type BuilderOutput = FileFsRef | Lambda

interface BuilderOutputs {
  [key: string]: BuilderOutput
}

interface HttpHeaderConfig {
  [header: string]: string
}

interface RouteConfig {
  src: string,
  dest: string,
  methods?: string[],
  headers?: HttpHeaderConfig[],
  status?: number
}

interface RouteResult {
  // "dest": <string of the dest, either file for lambda or full url for remote>
  dest: BuilderOutput | string,
  // "status": <integer in case exit code is intended to be changed>
  status?: number,
  // "headers": <object of the added response header values>
  headers?: HttpHeaderConfig[],
  // "uri_args": <object (key=value) list of new uri args to be passed along to dest >
  uri_args?: {[key: string]: any},
  // "matched_route": <object of the route spec that matched>
  matched_route?: RouteConfig,
  // "matched_route_idx": <integer of the index of the route matched>
  matched_route_idx?: number
}

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
