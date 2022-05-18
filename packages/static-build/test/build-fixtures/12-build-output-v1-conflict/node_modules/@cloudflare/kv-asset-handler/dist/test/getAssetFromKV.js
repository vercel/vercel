"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ava_1 = require("ava");
const mocks_1 = require("../mocks");
(0, mocks_1.mockGlobalScope)();
const index_1 = require("../index");
(0, ava_1.default)('getAssetFromKV return correct val from KV and default caching', async (t) => {
    (0, mocks_1.mockRequestScope)();
    const event = (0, mocks_1.getEvent)(new Request('https://blah.com/key1.txt'));
    const res = await (0, index_1.getAssetFromKV)(event);
    if (res) {
        t.is(res.headers.get('cache-control'), null);
        t.is(res.headers.get('cf-cache-status'), 'MISS');
        t.is(await res.text(), 'val1');
        t.true(res.headers.get('content-type').includes('text'));
    }
    else {
        t.fail('Response was undefined');
    }
});
(0, ava_1.default)('getAssetFromKV evaluated the file matching the extensionless path first /client/ -> client', async (t) => {
    (0, mocks_1.mockRequestScope)();
    const event = (0, mocks_1.getEvent)(new Request(`https://foo.com/client/`));
    const res = await (0, index_1.getAssetFromKV)(event);
    t.is(await res.text(), 'important file');
    t.true(res.headers.get('content-type').includes('text'));
});
(0, ava_1.default)('getAssetFromKV evaluated the file matching the extensionless path first /client -> client', async (t) => {
    (0, mocks_1.mockRequestScope)();
    const event = (0, mocks_1.getEvent)(new Request(`https://foo.com/client`));
    const res = await (0, index_1.getAssetFromKV)(event);
    t.is(await res.text(), 'important file');
    t.true(res.headers.get('content-type').includes('text'));
});
(0, ava_1.default)('getAssetFromKV if not in asset manifest still returns nohash.txt', async (t) => {
    (0, mocks_1.mockRequestScope)();
    const event = (0, mocks_1.getEvent)(new Request('https://blah.com/nohash.txt'));
    const res = await (0, index_1.getAssetFromKV)(event);
    if (res) {
        t.is(await res.text(), 'no hash but still got some result');
        t.true(res.headers.get('content-type').includes('text'));
    }
    else {
        t.fail('Response was undefined');
    }
});
(0, ava_1.default)('getAssetFromKV if no asset manifest /client -> client fails', async (t) => {
    (0, mocks_1.mockRequestScope)();
    const event = (0, mocks_1.getEvent)(new Request(`https://foo.com/client`));
    const error = await t.throwsAsync((0, index_1.getAssetFromKV)(event, { ASSET_MANIFEST: {} }));
    t.is(error.status, 404);
});
(0, ava_1.default)('getAssetFromKV if sub/ -> sub/index.html served', async (t) => {
    (0, mocks_1.mockRequestScope)();
    const event = (0, mocks_1.getEvent)(new Request(`https://foo.com/sub`));
    const res = await (0, index_1.getAssetFromKV)(event);
    if (res) {
        t.is(await res.text(), 'picturedis');
    }
    else {
        t.fail('Response was undefined');
    }
});
(0, ava_1.default)('getAssetFromKV gets index.html by default for / requests', async (t) => {
    (0, mocks_1.mockRequestScope)();
    const event = (0, mocks_1.getEvent)(new Request('https://blah.com/'));
    const res = await (0, index_1.getAssetFromKV)(event);
    if (res) {
        t.is(await res.text(), 'index.html');
        t.true(res.headers.get('content-type').includes('html'));
    }
    else {
        t.fail('Response was undefined');
    }
});
(0, ava_1.default)('getAssetFromKV non ASCII path support', async (t) => {
    (0, mocks_1.mockRequestScope)();
    const event = (0, mocks_1.getEvent)(new Request('https://blah.com/测试.html'));
    const res = await (0, index_1.getAssetFromKV)(event);
    if (res) {
        t.is(await res.text(), 'My filename is non-ascii');
    }
    else {
        t.fail('Response was undefined');
    }
});
(0, ava_1.default)('getAssetFromKV supports browser percent encoded URLs', async (t) => {
    (0, mocks_1.mockRequestScope)();
    const event = (0, mocks_1.getEvent)(new Request('https://example.com/%not-really-percent-encoded.html'));
    const res = await (0, index_1.getAssetFromKV)(event);
    if (res) {
        t.is(await res.text(), 'browser percent encoded');
    }
    else {
        t.fail('Response was undefined');
    }
});
(0, ava_1.default)('getAssetFromKV supports user percent encoded URLs', async (t) => {
    (0, mocks_1.mockRequestScope)();
    const event = (0, mocks_1.getEvent)(new Request('https://blah.com/%2F.html'));
    const res = await (0, index_1.getAssetFromKV)(event);
    if (res) {
        t.is(await res.text(), 'user percent encoded');
    }
    else {
        t.fail('Response was undefined');
    }
});
(0, ava_1.default)('getAssetFromKV only decode URL when necessary', async (t) => {
    (0, mocks_1.mockRequestScope)();
    const event1 = (0, mocks_1.getEvent)(new Request('https://blah.com/%E4%BD%A0%E5%A5%BD.html'));
    const event2 = (0, mocks_1.getEvent)(new Request('https://blah.com/你好.html'));
    const res1 = await (0, index_1.getAssetFromKV)(event1);
    const res2 = await (0, index_1.getAssetFromKV)(event2);
    if (res1 && res2) {
        t.is(await res1.text(), 'Im important');
        t.is(await res2.text(), 'Im important');
    }
    else {
        t.fail('Response was undefined');
    }
});
(0, ava_1.default)('getAssetFromKV Support for user decode url path', async (t) => {
    (0, mocks_1.mockRequestScope)();
    const event1 = (0, mocks_1.getEvent)(new Request('https://blah.com/%E4%BD%A0%E5%A5%BD/'));
    const event2 = (0, mocks_1.getEvent)(new Request('https://blah.com/你好/'));
    const res1 = await (0, index_1.getAssetFromKV)(event1);
    const res2 = await (0, index_1.getAssetFromKV)(event2);
    if (res1 && res2) {
        t.is(await res1.text(), 'My path is non-ascii');
        t.is(await res2.text(), 'My path is non-ascii');
    }
    else {
        t.fail('Response was undefined');
    }
});
(0, ava_1.default)('getAssetFromKV custom key modifier', async (t) => {
    (0, mocks_1.mockRequestScope)();
    const event = (0, mocks_1.getEvent)(new Request('https://blah.com/docs/sub/blah.png'));
    const customRequestMapper = (request) => {
        let defaultModifiedRequest = (0, index_1.mapRequestToAsset)(request);
        let url = new URL(defaultModifiedRequest.url);
        url.pathname = url.pathname.replace('/docs', '');
        return new Request(url.toString(), request);
    };
    const res = await (0, index_1.getAssetFromKV)(event, { mapRequestToAsset: customRequestMapper });
    if (res) {
        t.is(await res.text(), 'picturedis');
    }
    else {
        t.fail('Response was undefined');
    }
});
(0, ava_1.default)('getAssetFromKV request override with existing manifest file', async (t) => {
    // see https://github.com/cloudflare/kv-asset-handler/pull/159 for more info
    (0, mocks_1.mockRequestScope)();
    const event = (0, mocks_1.getEvent)(new Request('https://blah.com/image.png')); // real file in manifest
    const customRequestMapper = (request) => {
        let defaultModifiedRequest = (0, index_1.mapRequestToAsset)(request);
        let url = new URL(defaultModifiedRequest.url);
        url.pathname = '/image.webp'; // other different file in manifest
        return new Request(url.toString(), request);
    };
    const res = await (0, index_1.getAssetFromKV)(event, { mapRequestToAsset: customRequestMapper });
    if (res) {
        t.is(await res.text(), 'imagewebp');
    }
    else {
        t.fail('Response was undefined');
    }
});
(0, ava_1.default)('getAssetFromKV when setting browser caching', async (t) => {
    (0, mocks_1.mockRequestScope)();
    const event = (0, mocks_1.getEvent)(new Request('https://blah.com/'));
    const res = await (0, index_1.getAssetFromKV)(event, { cacheControl: { browserTTL: 22 } });
    if (res) {
        t.is(res.headers.get('cache-control'), 'max-age=22');
    }
    else {
        t.fail('Response was undefined');
    }
});
(0, ava_1.default)('getAssetFromKV when setting custom cache setting', async (t) => {
    (0, mocks_1.mockRequestScope)();
    const event1 = (0, mocks_1.getEvent)(new Request('https://blah.com/'));
    const event2 = (0, mocks_1.getEvent)(new Request('https://blah.com/key1.png?blah=34'));
    const cacheOnlyPngs = (req) => {
        if (new URL(req.url).pathname.endsWith('.png'))
            return {
                browserTTL: 720,
                edgeTTL: 720,
            };
        else
            return {
                bypassCache: true,
            };
    };
    const res1 = await (0, index_1.getAssetFromKV)(event1, { cacheControl: cacheOnlyPngs });
    const res2 = await (0, index_1.getAssetFromKV)(event2, { cacheControl: cacheOnlyPngs });
    if (res1 && res2) {
        t.is(res1.headers.get('cache-control'), null);
        t.true(res2.headers.get('content-type').includes('png'));
        t.is(res2.headers.get('cache-control'), 'max-age=720');
        t.is(res2.headers.get('cf-cache-status'), 'MISS');
    }
    else {
        t.fail('Response was undefined');
    }
});
(0, ava_1.default)('getAssetFromKV caches on two sequential requests', async (t) => {
    (0, mocks_1.mockRequestScope)();
    const resourceKey = 'cache.html';
    const resourceVersion = JSON.parse((0, mocks_1.mockManifest)())[resourceKey];
    const event1 = (0, mocks_1.getEvent)(new Request(`https://blah.com/${resourceKey}`));
    const event2 = (0, mocks_1.getEvent)(new Request(`https://blah.com/${resourceKey}`, {
        headers: {
            'if-none-match': `"${resourceVersion}"`,
        },
    }));
    const res1 = await (0, index_1.getAssetFromKV)(event1, { cacheControl: { edgeTTL: 720, browserTTL: 720 } });
    await (0, mocks_1.sleep)(1);
    const res2 = await (0, index_1.getAssetFromKV)(event2);
    if (res1 && res2) {
        t.is(res1.headers.get('cf-cache-status'), 'MISS');
        t.is(res1.headers.get('cache-control'), 'max-age=720');
        t.is(res2.headers.get('cf-cache-status'), 'REVALIDATED');
    }
    else {
        t.fail('Response was undefined');
    }
});
(0, ava_1.default)('getAssetFromKV does not store max-age on two sequential requests', async (t) => {
    (0, mocks_1.mockRequestScope)();
    const resourceKey = 'cache.html';
    const resourceVersion = JSON.parse((0, mocks_1.mockManifest)())[resourceKey];
    const event1 = (0, mocks_1.getEvent)(new Request(`https://blah.com/${resourceKey}`));
    const event2 = (0, mocks_1.getEvent)(new Request(`https://blah.com/${resourceKey}`, {
        headers: {
            'if-none-match': `"${resourceVersion}"`,
        },
    }));
    const res1 = await (0, index_1.getAssetFromKV)(event1, { cacheControl: { edgeTTL: 720 } });
    await (0, mocks_1.sleep)(100);
    const res2 = await (0, index_1.getAssetFromKV)(event2);
    if (res1 && res2) {
        t.is(res1.headers.get('cf-cache-status'), 'MISS');
        t.is(res1.headers.get('cache-control'), null);
        t.is(res2.headers.get('cf-cache-status'), 'REVALIDATED');
        t.is(res2.headers.get('cache-control'), null);
    }
    else {
        t.fail('Response was undefined');
    }
});
(0, ava_1.default)('getAssetFromKV does not cache on Cloudflare when bypass cache set', async (t) => {
    (0, mocks_1.mockRequestScope)();
    const event = (0, mocks_1.getEvent)(new Request('https://blah.com/'));
    const res = await (0, index_1.getAssetFromKV)(event, { cacheControl: { bypassCache: true } });
    if (res) {
        t.is(res.headers.get('cache-control'), null);
        t.is(res.headers.get('cf-cache-status'), null);
    }
    else {
        t.fail('Response was undefined');
    }
});
(0, ava_1.default)('getAssetFromKV with no trailing slash on root', async (t) => {
    (0, mocks_1.mockRequestScope)();
    const event = (0, mocks_1.getEvent)(new Request('https://blah.com'));
    const res = await (0, index_1.getAssetFromKV)(event);
    if (res) {
        t.is(await res.text(), 'index.html');
    }
    else {
        t.fail('Response was undefined');
    }
});
(0, ava_1.default)('getAssetFromKV with no trailing slash on a subdirectory', async (t) => {
    (0, mocks_1.mockRequestScope)();
    const event = (0, mocks_1.getEvent)(new Request('https://blah.com/sub/blah.png'));
    const res = await (0, index_1.getAssetFromKV)(event);
    if (res) {
        t.is(await res.text(), 'picturedis');
    }
    else {
        t.fail('Response was undefined');
    }
});
(0, ava_1.default)('getAssetFromKV no result throws an error', async (t) => {
    (0, mocks_1.mockRequestScope)();
    const event = (0, mocks_1.getEvent)(new Request('https://blah.com/random'));
    const error = await t.throwsAsync((0, index_1.getAssetFromKV)(event));
    t.is(error.status, 404);
});
(0, ava_1.default)('getAssetFromKV TTls set to null should not cache on browser or edge', async (t) => {
    (0, mocks_1.mockRequestScope)();
    const event = (0, mocks_1.getEvent)(new Request('https://blah.com/'));
    const res1 = await (0, index_1.getAssetFromKV)(event, { cacheControl: { browserTTL: null, edgeTTL: null } });
    await (0, mocks_1.sleep)(100);
    const res2 = await (0, index_1.getAssetFromKV)(event, { cacheControl: { browserTTL: null, edgeTTL: null } });
    if (res1 && res2) {
        t.is(res1.headers.get('cf-cache-status'), null);
        t.is(res1.headers.get('cache-control'), null);
        t.is(res2.headers.get('cf-cache-status'), null);
        t.is(res2.headers.get('cache-control'), null);
    }
    else {
        t.fail('Response was undefined');
    }
});
(0, ava_1.default)('getAssetFromKV passing in a custom NAMESPACE serves correct asset', async (t) => {
    (0, mocks_1.mockRequestScope)();
    let CUSTOM_NAMESPACE = (0, mocks_1.mockKV)({
        'key1.123HASHBROWN.txt': 'val1',
    });
    Object.assign(global, { CUSTOM_NAMESPACE });
    const event = (0, mocks_1.getEvent)(new Request('https://blah.com/'));
    const res = await (0, index_1.getAssetFromKV)(event);
    if (res) {
        t.is(await res.text(), 'index.html');
        t.true(res.headers.get('content-type').includes('html'));
    }
    else {
        t.fail('Response was undefined');
    }
});
(0, ava_1.default)('getAssetFromKV when custom namespace without the asset should fail', async (t) => {
    (0, mocks_1.mockRequestScope)();
    let CUSTOM_NAMESPACE = (0, mocks_1.mockKV)({
        'key5.123HASHBROWN.txt': 'customvalu',
    });
    const event = (0, mocks_1.getEvent)(new Request('https://blah.com'));
    const error = await t.throwsAsync((0, index_1.getAssetFromKV)(event, { ASSET_NAMESPACE: CUSTOM_NAMESPACE }));
    t.is(error.status, 404);
});
(0, ava_1.default)('getAssetFromKV when namespace not bound fails', async (t) => {
    (0, mocks_1.mockRequestScope)();
    var MY_CUSTOM_NAMESPACE = undefined;
    Object.assign(global, { MY_CUSTOM_NAMESPACE });
    const event = (0, mocks_1.getEvent)(new Request('https://blah.com/'));
    const error = await t.throwsAsync((0, index_1.getAssetFromKV)(event, { ASSET_NAMESPACE: MY_CUSTOM_NAMESPACE }));
    t.is(error.status, 500);
});
(0, ava_1.default)('getAssetFromKV when if-none-match === active resource version, should revalidate', async (t) => {
    (0, mocks_1.mockRequestScope)();
    const resourceKey = 'key1.png';
    const resourceVersion = JSON.parse((0, mocks_1.mockManifest)())[resourceKey];
    const event1 = (0, mocks_1.getEvent)(new Request(`https://blah.com/${resourceKey}`));
    const event2 = (0, mocks_1.getEvent)(new Request(`https://blah.com/${resourceKey}`, {
        headers: {
            'if-none-match': `W/"${resourceVersion}"`,
        },
    }));
    const res1 = await (0, index_1.getAssetFromKV)(event1, { cacheControl: { edgeTTL: 720 } });
    await (0, mocks_1.sleep)(100);
    const res2 = await (0, index_1.getAssetFromKV)(event2);
    if (res1 && res2) {
        t.is(res1.headers.get('cf-cache-status'), 'MISS');
        t.is(res2.headers.get('cf-cache-status'), 'REVALIDATED');
    }
    else {
        t.fail('Response was undefined');
    }
});
(0, ava_1.default)('getAssetFromKV when if-none-match equals etag of stale resource then should bypass cache', async (t) => {
    (0, mocks_1.mockRequestScope)();
    const resourceKey = 'key1.png';
    const resourceVersion = JSON.parse((0, mocks_1.mockManifest)())[resourceKey];
    const req1 = new Request(`https://blah.com/${resourceKey}`, {
        headers: {
            'if-none-match': `"${resourceVersion}"`,
        },
    });
    const req2 = new Request(`https://blah.com/${resourceKey}`, {
        headers: {
            'if-none-match': `"${resourceVersion}-another-version"`,
        },
    });
    const event = (0, mocks_1.getEvent)(req1);
    const event2 = (0, mocks_1.getEvent)(req2);
    const res1 = await (0, index_1.getAssetFromKV)(event, { cacheControl: { edgeTTL: 720 } });
    const res2 = await (0, index_1.getAssetFromKV)(event);
    const res3 = await (0, index_1.getAssetFromKV)(event2);
    if (res1 && res2 && res3) {
        t.is(res1.headers.get('cf-cache-status'), 'MISS');
        t.is(res2.headers.get('etag'), `W/${req1.headers.get('if-none-match')}`);
        t.is(res2.headers.get('cf-cache-status'), 'REVALIDATED');
        t.not(res3.headers.get('etag'), req2.headers.get('if-none-match'));
        t.is(res3.headers.get('cf-cache-status'), 'MISS');
    }
    else {
        t.fail('Response was undefined');
    }
});
(0, ava_1.default)('getAssetFromKV when resource in cache, etag should be weakened before returned to eyeball', async (t) => {
    (0, mocks_1.mockRequestScope)();
    const resourceKey = 'key1.png';
    const resourceVersion = JSON.parse((0, mocks_1.mockManifest)())[resourceKey];
    const req1 = new Request(`https://blah.com/${resourceKey}`, {
        headers: {
            'if-none-match': `"${resourceVersion}"`,
        },
    });
    const event = (0, mocks_1.getEvent)(req1);
    const res1 = await (0, index_1.getAssetFromKV)(event, { cacheControl: { edgeTTL: 720 } });
    const res2 = await (0, index_1.getAssetFromKV)(event);
    if (res1 && res2) {
        t.is(res1.headers.get('cf-cache-status'), 'MISS');
        t.is(res2.headers.get('etag'), `W/${req1.headers.get('if-none-match')}`);
    }
    else {
        t.fail('Response was undefined');
    }
});
(0, ava_1.default)('getAssetFromKV if-none-match not sent but resource in cache, should return cache hit 200 OK', async (t) => {
    const resourceKey = 'cache.html';
    const event = (0, mocks_1.getEvent)(new Request(`https://blah.com/${resourceKey}`));
    const res1 = await (0, index_1.getAssetFromKV)(event, { cacheControl: { edgeTTL: 720 } });
    await (0, mocks_1.sleep)(1);
    const res2 = await (0, index_1.getAssetFromKV)(event);
    if (res1 && res2) {
        t.is(res1.headers.get('cf-cache-status'), 'MISS');
        t.is(res1.headers.get('cache-control'), null);
        t.is(res2.status, 200);
        t.is(res2.headers.get('cf-cache-status'), 'HIT');
    }
    else {
        t.fail('Response was undefined');
    }
});
(0, ava_1.default)('getAssetFromKV if range request submitted and resource in cache, request fulfilled', async (t) => {
    const resourceKey = 'cache.html';
    const event1 = (0, mocks_1.getEvent)(new Request(`https://blah.com/${resourceKey}`));
    const event2 = (0, mocks_1.getEvent)(new Request(`https://blah.com/${resourceKey}`, { headers: { range: 'bytes=0-10' } }));
    const res1 = (0, index_1.getAssetFromKV)(event1, { cacheControl: { edgeTTL: 720 } });
    await res1;
    await (0, mocks_1.sleep)(2);
    const res2 = await (0, index_1.getAssetFromKV)(event2);
    if (res2.headers.has('content-range')) {
        t.is(res2.status, 206);
    }
    else {
        t.fail('Response was undefined');
    }
});
ava_1.default.todo('getAssetFromKV when body not empty, should invoke .cancel()');
