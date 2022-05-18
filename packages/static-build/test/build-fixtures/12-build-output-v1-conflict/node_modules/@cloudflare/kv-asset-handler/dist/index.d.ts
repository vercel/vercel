import { Options, CacheControl, MethodNotAllowedError, NotFoundError, InternalError } from './types';
declare global {
    var __STATIC_CONTENT: any, __STATIC_CONTENT_MANIFEST: string;
}
/**
 * maps the path of incoming request to the request pathKey to look up
 * in bucket and in cache
 * e.g.  for a path '/' returns '/index.html' which serves
 * the content of bucket/index.html
 * @param {Request} request incoming request
 */
declare const mapRequestToAsset: (request: Request, options?: Partial<Options>) => Request;
/**
 * maps the path of incoming request to /index.html if it evaluates to
 * any HTML file.
 * @param {Request} request incoming request
 */
declare function serveSinglePageApp(request: Request, options?: Partial<Options>): Request;
/**
 * takes the path of the incoming request, gathers the appropriate content from KV, and returns
 * the response
 *
 * @param {FetchEvent} event the fetch event of the triggered request
 * @param {{mapRequestToAsset: (string: Request) => Request, cacheControl: {bypassCache:boolean, edgeTTL: number, browserTTL:number}, ASSET_NAMESPACE: any, ASSET_MANIFEST:any}} [options] configurable options
 * @param {CacheControl} [options.cacheControl] determine how to cache on Cloudflare and the browser
 * @param {typeof(options.mapRequestToAsset)} [options.mapRequestToAsset]  maps the path of incoming request to the request pathKey to look up
 * @param {Object | string} [options.ASSET_NAMESPACE] the binding to the namespace that script references
 * @param {any} [options.ASSET_MANIFEST] the map of the key to cache and store in KV
 * */
declare type Evt = {
    request: Request;
    waitUntil: (promise: Promise<any>) => void;
};
declare const getAssetFromKV: (event: Evt, options?: Partial<Options>) => Promise<Response>;
export { getAssetFromKV, mapRequestToAsset, serveSinglePageApp };
export { Options, CacheControl, MethodNotAllowedError, NotFoundError, InternalError };
