"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InternalError = exports.NotFoundError = exports.MethodNotAllowedError = exports.serveSinglePageApp = exports.mapRequestToAsset = exports.getAssetFromKV = void 0;
const mime = require("mime");
const types_1 = require("./types");
Object.defineProperty(exports, "MethodNotAllowedError", { enumerable: true, get: function () { return types_1.MethodNotAllowedError; } });
Object.defineProperty(exports, "NotFoundError", { enumerable: true, get: function () { return types_1.NotFoundError; } });
Object.defineProperty(exports, "InternalError", { enumerable: true, get: function () { return types_1.InternalError; } });
const defaultCacheControl = {
    browserTTL: null,
    edgeTTL: 2 * 60 * 60 * 24,
    bypassCache: false, // do not bypass Cloudflare's cache
};
const parseStringAsObject = (maybeString) => typeof maybeString === 'string' ? JSON.parse(maybeString) : maybeString;
const getAssetFromKVDefaultOptions = {
    ASSET_NAMESPACE: typeof __STATIC_CONTENT !== 'undefined' ? __STATIC_CONTENT : undefined,
    ASSET_MANIFEST: typeof __STATIC_CONTENT_MANIFEST !== 'undefined'
        ? parseStringAsObject(__STATIC_CONTENT_MANIFEST)
        : {},
    cacheControl: defaultCacheControl,
    defaultMimeType: 'text/plain',
    defaultDocument: 'index.html',
    pathIsEncoded: false,
};
function assignOptions(options) {
    // Assign any missing options passed in to the default
    // options.mapRequestToAsset is handled manually later
    return Object.assign({}, getAssetFromKVDefaultOptions, options);
}
/**
 * maps the path of incoming request to the request pathKey to look up
 * in bucket and in cache
 * e.g.  for a path '/' returns '/index.html' which serves
 * the content of bucket/index.html
 * @param {Request} request incoming request
 */
const mapRequestToAsset = (request, options) => {
    options = assignOptions(options);
    const parsedUrl = new URL(request.url);
    let pathname = parsedUrl.pathname;
    if (pathname.endsWith('/')) {
        // If path looks like a directory append options.defaultDocument
        // e.g. If path is /about/ -> /about/index.html
        pathname = pathname.concat(options.defaultDocument);
    }
    else if (!mime.getType(pathname)) {
        // If path doesn't look like valid content
        //  e.g. /about.me ->  /about.me/index.html
        pathname = pathname.concat('/' + options.defaultDocument);
    }
    parsedUrl.pathname = pathname;
    return new Request(parsedUrl.toString(), request);
};
exports.mapRequestToAsset = mapRequestToAsset;
/**
 * maps the path of incoming request to /index.html if it evaluates to
 * any HTML file.
 * @param {Request} request incoming request
 */
function serveSinglePageApp(request, options) {
    options = assignOptions(options);
    // First apply the default handler, which already has logic to detect
    // paths that should map to HTML files.
    request = mapRequestToAsset(request, options);
    const parsedUrl = new URL(request.url);
    // Detect if the default handler decided to map to
    // a HTML file in some specific directory.
    if (parsedUrl.pathname.endsWith('.html')) {
        // If expected HTML file was missing, just return the root index.html (or options.defaultDocument)
        return new Request(`${parsedUrl.origin}/${options.defaultDocument}`, request);
    }
    else {
        // The default handler decided this is not an HTML page. It's probably
        // an image, CSS, or JS file. Leave it as-is.
        return request;
    }
}
exports.serveSinglePageApp = serveSinglePageApp;
const getAssetFromKV = async (event, options) => {
    options = assignOptions(options);
    const request = event.request;
    const ASSET_NAMESPACE = options.ASSET_NAMESPACE;
    const ASSET_MANIFEST = parseStringAsObject(options.ASSET_MANIFEST);
    if (typeof ASSET_NAMESPACE === 'undefined') {
        throw new types_1.InternalError(`there is no KV namespace bound to the script`);
    }
    const rawPathKey = new URL(request.url).pathname.replace(/^\/+/, ''); // strip any preceding /'s
    let pathIsEncoded = options.pathIsEncoded;
    let requestKey;
    // if options.mapRequestToAsset is explicitly passed in, always use it and assume user has own intentions
    // otherwise handle request as normal, with default mapRequestToAsset below
    if (options.mapRequestToAsset) {
        requestKey = options.mapRequestToAsset(request);
    }
    else if (ASSET_MANIFEST[rawPathKey]) {
        requestKey = request;
    }
    else if (ASSET_MANIFEST[decodeURIComponent(rawPathKey)]) {
        pathIsEncoded = true;
        requestKey = request;
    }
    else {
        const mappedRequest = mapRequestToAsset(request);
        const mappedRawPathKey = new URL(mappedRequest.url).pathname.replace(/^\/+/, '');
        if (ASSET_MANIFEST[decodeURIComponent(mappedRawPathKey)]) {
            pathIsEncoded = true;
            requestKey = mappedRequest;
        }
        else {
            // use default mapRequestToAsset
            requestKey = mapRequestToAsset(request, options);
        }
    }
    const SUPPORTED_METHODS = ['GET', 'HEAD'];
    if (!SUPPORTED_METHODS.includes(requestKey.method)) {
        throw new types_1.MethodNotAllowedError(`${requestKey.method} is not a valid request method`);
    }
    const parsedUrl = new URL(requestKey.url);
    const pathname = pathIsEncoded ? decodeURIComponent(parsedUrl.pathname) : parsedUrl.pathname; // decode percentage encoded path only when necessary
    // pathKey is the file path to look up in the manifest
    let pathKey = pathname.replace(/^\/+/, ''); // remove prepended /
    // @ts-ignore
    const cache = caches.default;
    let mimeType = mime.getType(pathKey) || options.defaultMimeType;
    if (mimeType.startsWith('text') || mimeType === 'application/javascript') {
        mimeType += '; charset=utf-8';
    }
    let shouldEdgeCache = false; // false if storing in KV by raw file path i.e. no hash
    // check manifest for map from file path to hash
    if (typeof ASSET_MANIFEST !== 'undefined') {
        if (ASSET_MANIFEST[pathKey]) {
            pathKey = ASSET_MANIFEST[pathKey];
            // if path key is in asset manifest, we can assume it contains a content hash and can be cached
            shouldEdgeCache = true;
        }
    }
    // TODO this excludes search params from cache, investigate ideal behavior
    let cacheKey = new Request(`${parsedUrl.origin}/${pathKey}`, request);
    // if argument passed in for cacheControl is a function then
    // evaluate that function. otherwise return the Object passed in
    // or default Object
    const evalCacheOpts = (() => {
        switch (typeof options.cacheControl) {
            case 'function':
                return options.cacheControl(request);
            case 'object':
                return options.cacheControl;
            default:
                return defaultCacheControl;
        }
    })();
    // formats the etag depending on the response context. if the entityId
    // is invalid, returns an empty string (instead of null) to prevent the
    // the potentially disastrous scenario where the value of the Etag resp
    // header is "null". Could be modified in future to base64 encode etc
    const formatETag = (entityId = pathKey, validatorType = 'strong') => {
        if (!entityId) {
            return '';
        }
        switch (validatorType) {
            case 'weak':
                if (!entityId.startsWith('W/')) {
                    return `W/${entityId}`;
                }
                return entityId;
            case 'strong':
                if (entityId.startsWith(`W/"`)) {
                    entityId = entityId.replace('W/', '');
                }
                if (!entityId.endsWith(`"`)) {
                    entityId = `"${entityId}"`;
                }
                return entityId;
            default:
                return '';
        }
    };
    options.cacheControl = Object.assign({}, defaultCacheControl, evalCacheOpts);
    // override shouldEdgeCache if options say to bypassCache
    if (options.cacheControl.bypassCache ||
        options.cacheControl.edgeTTL === null ||
        request.method == 'HEAD') {
        shouldEdgeCache = false;
    }
    // only set max-age if explicitly passed in a number as an arg
    const shouldSetBrowserCache = typeof options.cacheControl.browserTTL === 'number';
    let response = null;
    if (shouldEdgeCache) {
        response = await cache.match(cacheKey);
    }
    if (response) {
        if (response.status > 300 && response.status < 400) {
            if (response.body && 'cancel' in Object.getPrototypeOf(response.body)) {
                // Body exists and environment supports readable streams
                response.body.cancel();
            }
            else {
                // Environment doesnt support readable streams, or null repsonse body. Nothing to do
            }
            response = new Response(null, response);
        }
        else {
            // fixes #165
            let opts = {
                headers: new Headers(response.headers),
                status: 0,
                statusText: '',
            };
            opts.headers.set('cf-cache-status', 'HIT');
            if (response.status) {
                opts.status = response.status;
                opts.statusText = response.statusText;
            }
            else if (opts.headers.has('Content-Range')) {
                opts.status = 206;
                opts.statusText = 'Partial Content';
            }
            else {
                opts.status = 200;
                opts.statusText = 'OK';
            }
            response = new Response(response.body, opts);
        }
    }
    else {
        const body = await ASSET_NAMESPACE.get(pathKey, 'arrayBuffer');
        if (body === null) {
            throw new types_1.NotFoundError(`could not find ${pathKey} in your content namespace`);
        }
        response = new Response(body);
        if (shouldEdgeCache) {
            response.headers.set('Accept-Ranges', 'bytes');
            response.headers.set('Content-Length', body.length);
            // set etag before cache insertion
            if (!response.headers.has('etag')) {
                response.headers.set('etag', formatETag(pathKey, 'strong'));
            }
            // determine Cloudflare cache behavior
            response.headers.set('Cache-Control', `max-age=${options.cacheControl.edgeTTL}`);
            event.waitUntil(cache.put(cacheKey, response.clone()));
            response.headers.set('CF-Cache-Status', 'MISS');
        }
    }
    response.headers.set('Content-Type', mimeType);
    if (response.status === 304) {
        let etag = formatETag(response.headers.get('etag'), 'strong');
        let ifNoneMatch = cacheKey.headers.get('if-none-match');
        let proxyCacheStatus = response.headers.get('CF-Cache-Status');
        if (etag) {
            if (ifNoneMatch && ifNoneMatch === etag && proxyCacheStatus === 'MISS') {
                response.headers.set('CF-Cache-Status', 'EXPIRED');
            }
            else {
                response.headers.set('CF-Cache-Status', 'REVALIDATED');
            }
            response.headers.set('etag', formatETag(etag, 'weak'));
        }
    }
    if (shouldSetBrowserCache) {
        response.headers.set('Cache-Control', `max-age=${options.cacheControl.browserTTL}`);
    }
    else {
        response.headers.delete('Cache-Control');
    }
    return response;
};
exports.getAssetFromKV = getAssetFromKV;
