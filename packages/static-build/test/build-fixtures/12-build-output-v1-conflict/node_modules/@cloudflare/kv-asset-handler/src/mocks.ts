const makeServiceWorkerEnv = require('service-worker-mock')

const HASH = '123HASHBROWN'

export const getEvent = (request: Request): any => {
  const waitUntil = async (callback: any) => {
    await callback
  }
  return {
    request,
    waitUntil,
  }
}
const store: any = {
  'key1.123HASHBROWN.txt': 'val1',
  'key1.123HASHBROWN.png': 'val1',
  'index.123HASHBROWN.html': 'index.html',
  'cache.123HASHBROWN.html': 'cache me if you can',
  '测试.123HASHBROWN.html': 'My filename is non-ascii',
  '%not-really-percent-encoded.123HASHBROWN.html': 'browser percent encoded',
  '%2F.123HASHBROWN.html': 'user percent encoded',
  '你好.123HASHBROWN.html': 'I shouldnt be served',
  '%E4%BD%A0%E5%A5%BD.123HASHBROWN.html': 'Im important',
  'nohash.txt': 'no hash but still got some result',
  'sub/blah.123HASHBROWN.png': 'picturedis',
  'sub/index.123HASHBROWN.html': 'picturedis',
  'client.123HASHBROWN': 'important file',
  'client.123HASHBROWN/index.html': 'Im here but serve my big bro above',
  'image.123HASHBROWN.png': 'imagepng',
  'image.123HASHBROWN.webp': 'imagewebp',
  '你好/index.123HASHBROWN.html': 'My path is non-ascii',
}
export const mockKV = (store: any) => {
  return {
    get: (path: string) => store[path] || null,
  }
}

export const mockManifest = () => {
  return JSON.stringify({
    'key1.txt': `key1.${HASH}.txt`,
    'key1.png': `key1.${HASH}.png`,
    'cache.html': `cache.${HASH}.html`,
    '测试.html': `测试.${HASH}.html`,
    '你好.html': `你好.${HASH}.html`,
    '%not-really-percent-encoded.html': `%not-really-percent-encoded.${HASH}.html`,
    '%2F.html': `%2F.${HASH}.html`,
    '%E4%BD%A0%E5%A5%BD.html': `%E4%BD%A0%E5%A5%BD.${HASH}.html`,
    'index.html': `index.${HASH}.html`,
    'sub/blah.png': `sub/blah.${HASH}.png`,
    'sub/index.html': `sub/index.${HASH}.html`,
    client: `client.${HASH}`,
    'client/index.html': `client.${HASH}`,
    'image.png': `image.${HASH}.png`,
    'image.webp': `image.${HASH}.webp`,
    '你好/index.html': `你好/index.${HASH}.html`,
  })
}

let cacheStore: any = new Map()
interface CacheKey {
  url: object
  headers: object
}
export const mockCaches = () => {
  return {
    default: {
      async match(key: any) {
        let cacheKey: CacheKey = {
          url: key.url,
          headers: {},
        }
        let response
        if (key.headers.has('if-none-match')) {
          let makeStrongEtag = key.headers.get('if-none-match').replace('W/', '')
          Reflect.set(cacheKey.headers, 'etag', makeStrongEtag)
          response = cacheStore.get(JSON.stringify(cacheKey))
        } else {
          // if client doesn't send if-none-match, we need to iterate through these keys
          // and just test the URL
          const activeCacheKeys: Array<string> = Array.from(cacheStore.keys())
          for (const cacheStoreKey of activeCacheKeys) {
            if (JSON.parse(cacheStoreKey).url === key.url) {
              response = cacheStore.get(cacheStoreKey)
            }
          }
        }
        // TODO: write test to accomodate for rare scenarios with where range requests accomodate etags
        if (response && !key.headers.has('if-none-match')) {
          // this appears overly verbose, but is necessary to document edge cache behavior
          // The Range request header triggers the response header Content-Range ...
          const range = key.headers.get('range')
          if (range) {
            response.headers.set(
              'content-range',
              `bytes ${range.split('=').pop()}/${response.headers.get('content-length')}`,
            )
          }
          // ... which we are using in this repository to set status 206
          if (response.headers.has('content-range')) {
            response.status = 206
          } else {
            response.status = 200
          }
          let etag = response.headers.get('etag')
          if (etag && !etag.includes('W/')) {
            response.headers.set('etag', `W/${etag}`)
          }
        }
        return response
      },
      async put(key: any, val: Response) {
        let headers = new Headers(val.headers)
        let url = new URL(key.url)
        let resWithBody = new Response(val.body, { headers, status: 200 })
        let resNoBody = new Response(null, { headers, status: 304 })
        let cacheKey: CacheKey = {
          url: key.url,
          headers: {
            etag: `"${url.pathname.replace('/', '')}"`,
          },
        }
        cacheStore.set(JSON.stringify(cacheKey), resNoBody)
        cacheKey.headers = {}
        cacheStore.set(JSON.stringify(cacheKey), resWithBody)
        return
      },
    },
  }
}

// mocks functionality used inside worker request
export function mockRequestScope() {
  Object.assign(global, makeServiceWorkerEnv())
  Object.assign(global, { __STATIC_CONTENT_MANIFEST: mockManifest() })
  Object.assign(global, { __STATIC_CONTENT: mockKV(store) })
  Object.assign(global, { caches: mockCaches() })
}

// mocks functionality used on global isolate scope. such as the KV namespace bind
export function mockGlobalScope() {
  Object.assign(global, { __STATIC_CONTENT_MANIFEST: mockManifest() })
  Object.assign(global, { __STATIC_CONTENT: mockKV(store) })
}

export const sleep = (milliseconds: number) => {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
