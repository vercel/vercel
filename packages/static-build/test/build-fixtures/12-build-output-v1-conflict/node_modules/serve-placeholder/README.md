# ♡ serve-placeholder

> Smart placeholder for missing assets

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![Github Actions][github-actions-src]][github-actions-href]
[![Codecov][codecov-src]][codecov-href]

## Why?

**💵 Rendering Errors is costly**

Serving each 404 page for assets adds extra load to the server and increases crashing chances. This is crucial for setups with server-side-rendering and removes additional SSR loads when assets like `robots.txt` or `favicon.ico` don't exist.

**👌 Meaningful Responses**

We can always send a better 404 response than an HTML page by knowing file extensions. For example, we send a fallback transparent 1x1 image for image extensions.

**🔍 SEO Friendly**

Instead of indexing invalid URLs with HTML pages, we properly send 404 and the right content type.

## Usage

Install package:

```sh
# npm
npm install serve-placeholder

# yarn
yarn install serve-placeholder

# pnpm
pnpm install serve-placeholder
```

Import:

```js
// ESM
import { servePlaceholder } from 'serve-placeholder'

// CommonJS
const { servePlaceholder } = require('serve-placeholder')
```

Create and add server middleware between serve-static and router middleware:

```diff
app.use('/assets', serveStatic(..))
++ app.use('/assets', servePlaceholder())
app.use('/', router)
```

Additionally, we can have a default placeholder for arbitrary routes which handles known extensions **assuming other routes have no extension**:

```diff
app.use('/assets', serveStatic(..))
app.use('/assets', servePlaceholder())
++ app.use('/', placeholder({ skipUnkown: true }))
app.use('/', router)
```

## Options

### `handlers`

A mapping from file extensions to the handler. Extensions should start with *dot* like `.js`.

You can disable any of the handlers by setting the value to `null`

If the value of a handler is set to `false`, the middleware will be ignored for that extension.

### `statusCode`

- Default: `404`

Sets `statusCode` for all handled responses. Set to `false` to disable overriding statusCode.

### `skipUnknown`

- Default: `false`

Skip middleware when no handler is defined for the current request.

Please note that if this option is set to `true`, then `default` handler will be disabled!

### `placeholders`

- Type: `Object`

A mapping from handler to placeholder. Values can be `String` or `Buffer`. You can disable any of the placeholders by setting the value to `false`.

### `mimes`

- Type: `Object`

A mapping from handler to the mime type. Mime type will be set as `Content-Type` header. You can disable sending any of the mimes by setting the value to `false`.

### `cacheHeaders`

- Default: `true`

Set headers to prevent accidentally caching 404 resources.

When enabled, these headers will be sent:

```js
{
  'cache-control': 'no-cache, no-store, must-revalidate',
  'expires': '0',
  'pragma': 'no-cache'
}
```

### `placeholderHeader`

- Default: `true`

Sets an `X-Placeholder` header with value of handler name.

## Defaults

These are [default handlers](./src/defaults.js). You can override every of them using provided options.

Handler    | Extensions             | Mime type                |  Placeholder
-----------|------------------------|--------------------------|-------------------
`default`  | any unknown extension  | -                        | -
`css`      | `.css`                 | `text/css`               | `/* style not found */`
`html`     | `.html`, `.htm`        | `text/html`              | `<!-- page not found -->`
`js`       | `.js`                  | `application/javascript` | `/* script not found */`
`json`     | `.json`                | `application/json`       | `{}`
`map`      | `.map`                 | `application/json`       | [empty sourcemap v3 json]
`plain`    | `.txt`, `.text`, `.md` | `text/plain`             | [empty]
`image`    | `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`, `.bmp`, `.ico` | `image/gif` | [transparent 1x1 image]

## 💻 Development

- Clone this repository
- Enable [Corepack](https://github.com/nodejs/corepack) using `corepack enable` (use `npm i -g corepack` for Node.js < 16.10)
- Install dependencies using `pnpm install`
- Run interactive tests using `pnpm dev`

## License

Made with 💛

Published under [MIT License](./LICENSE).

<!-- Badges -->
[npm-version-src]: https://img.shields.io/npm/v/serve-placeholder?style=flat-square
[npm-version-href]: https://npmjs.com/package/serve-placeholder

[npm-downloads-src]: https://img.shields.io/npm/dm/serve-placeholder?style=flat-square
[npm-downloads-href]: https://npmjs.com/package/serve-placeholder

[github-actions-src]: https://img.shields.io/github/workflow/status/unjs/serve-placeholder/ci/main?style=flat-square
[github-actions-href]: https://github.com/unjs/serve-placeholder/actions?query=workflow%3Aci

[codecov-src]: https://img.shields.io/codecov/c/gh/unjs/serve-placeholder/main?style=flat-square
[codecov-href]: https://codecov.io/gh/unjs/serve-placeholder
