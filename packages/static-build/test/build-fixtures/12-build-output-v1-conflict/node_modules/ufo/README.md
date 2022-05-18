[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![Github Actions][github-actions-src]][github-actions-href]
[![Codecov][codecov-src]][codecov-href]
[![bundle][bundle-src]][bundle-href]

![👽 ufo](.github/banner.svg)

## Install

Install using npm or yarn:

```bash
npm i ufo
# or
yarn add ufo
```

Import:

```js
// CommonJS
const { normalizeURL, joinURL } = require('ufo')

// ESM
import { normalizeURL, joinURL } from 'ufo'

// Deno
import { parseURL } from 'https://unpkg.com/ufo/dist/index.mjs'
```

**Notice:** You may need to transpile package and add URL polyfill for legacy environments

## Usage

### `normalizeURL`

- Ensures URL is properly encoded
- Ensures pathname starts with slash
- Preserves protocol/host if provided

```ts

// Result: test?query=123%20123#hash,%20test
normalizeURL('test?query=123 123#hash, test')

// Result: http://localhost:3000/
normalizeURL('http://localhost:3000')
```

### `joinURL`

```ts
// Result: a/b/c
joinURL('a', '/b', '/c')
```

### `resolveURL`

```ts
// Result: http://foo.com/foo/bar/baz?test=123#token
resolveURL('http://foo.com/foo?test=123#token', 'bar', 'baz')
```

### `parseURL`

```ts
// Result: { protocol: 'http:', auth: '', host: 'foo.com', pathname: '/foo', search: '?test=123', hash: '#token' }
parseURL('http://foo.com/foo?test=123#token')

// Result: { pathname: 'foo.com/foo', search: '?test=123', hash: '#token' }
parseURL('foo.com/foo?test=123#token')

// Result: { protocol: 'https:', auth: '', host: 'foo.com', pathname: '/foo', search: '?test=123', hash: '#token' }
parseURL('foo.com/foo?test=123#token', 'https://')
```

### `withQuery`

```ts
// Result: /foo?page=a&token=secret
withQuery('/foo?page=a', { token: 'secret' })
```

### `getQuery`

```ts
// Result: { test: '123', unicode: '好' }
getQuery('http://foo.com/foo?test=123&unicode=%E5%A5%BD')
```

### `$URL`

Implementing URL interface with some improvements:

- Supporting schemeless and hostless URLs
- Supporting relative URLs
- Preserving trailing-slash status
- Decoded and mutable classs properties (`protocol`, `host`, `auth`, `pathname`, `query`, `hash`)
- Consistent URL parser independent of environment
- Consistent encoding independent of environment
- Punycode support for host encoding

### `withTrailingSlash`

Ensures url ends with a trailing slash

```ts
// Result: /foo/
withTrailingSlash('/foo')
```

```ts
// Result: /path/?query=true
withTrailingSlash('/path?query=true', true)
```

### `withoutTrailingSlash`

Ensures url does not ends with a trailing slash

```ts
// Result: /foo
withoutTrailingSlash('/foo/')
```

```ts
// Result: /path?query=true
withoutTrailingSlash('/path/?query=true', true)
```

### `cleanDoubleSlashes`

Ensures url does not have double slash (except for protocol)

```ts
// Result: /foo/bar/
cleanDoubleSlashes('//foo//bar//')
// Result: http://example.com/analyze/http://localhost:3000/
cleanDoubleSlashes('http://example.com/analyze//http://localhost:3000//')
```

### `isSamePath`

Check two paths are equal or not. Trailing slash and encoding are normalized before comparation.

```ts
// Result: true
isSamePath('/foo', '/foo/')
```

### `isRelative`

Check if a path starts with `./` or `../`.

```ts
// Result: true
isRelative('./foo')
```

### `withHttp`

Ensures url protocol is `http`

```ts
// Result: http://example.com
withHttp('https://example.com')
```

### `withHttps`

Ensures url protocol is `https`

```ts
// Result: https://example.com
withHttps('http://example.com')
```

### `withProtocol`

Changes url protocol passed as second argument

```ts
// Result: ftp://example.com
withProtocol('http://example.com', 'ftp://')
```

### `withoutProtocol`

Removes url protocol

```ts
// Result: example.com
withoutProtocol('http://example.com')
```

### `isEqual`

Compare two URLs regardless of their slash condition or encoding:

```ts
// Result: true
isEqual('/foo', 'foo')
isEqual('foo/', 'foo')
isEqual('/foo bar', '/foo%20bar')

// Strict compare
// Result: false
isEqual('/foo', 'foo', { leadingSlash: true })
isEqual('foo/', 'foo', { trailingSlash: true })
isEqual('/foo bar', '/foo%20bar', { encoding: true })
```

## License

[MIT](./LICENSE)

Special thanks to Eduardo San Martin Morote ([posva](https://github.com/posva)) for [encoding utlities](https://github.com/vuejs/vue-router-next/blob/v4.0.1/src/encoding.ts)

<!-- Badges -->
[npm-version-src]: https://img.shields.io/npm/v/ufo?style=flat-square
[npm-version-href]: https://npmjs.com/package/ufo

[npm-downloads-src]: https://img.shields.io/npm/dm/ufo?style=flat-square
[npm-downloads-href]: https://npmjs.com/package/ufo

[github-actions-src]: https://img.shields.io/github/workflow/status/unjs/ufo/ci/main?style=flat-square
[github-actions-href]: https://github.com/unjs/ufo/actions?query=workflow%3Aci

[codecov-src]: https://img.shields.io/codecov/c/gh/unjs/ufo/main?style=flat-square
[codecov-href]: https://codecov.io/gh/unjs/ufo

[bundle-src]: https://img.shields.io/bundlephobia/minzip/ufo?style=flat-square
[bundle-href]: https://bundlephobia.com/result?p=ufo
