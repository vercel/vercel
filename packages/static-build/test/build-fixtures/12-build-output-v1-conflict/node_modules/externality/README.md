[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![Github Actions][github-actions-src]][github-actions-href]
[![Codecov][codecov-src]][codecov-href]
[![bundle][bundle-src]][bundle-href]

# Externality

Externality is a set of utilities for handling identifying whether a given package or path should be considered an external package that can be imported at runtime, or whether is should be bundled in a build step.

It also contains a webpack and rollup plugin for encapsulating this functionality.

## Install

Install using npm or yarn:

```bash
npm i externality
# or
yarn add externality
```

## Rollup plugin

```js
import { rollupExternals } from 'externality'
```

## Webpack plugin

```js
import { webpackExternals } from 'externality'
```

## Utils

### `resolveId`

This utility is powered by [`enhanced-resolve`](https://github.com/webpack/enhanced-resolve) and will resolve a given module/path with support for extensions, CJS/ESM and more.

```js
import { resolveId } from 'externality'

await resolveId('my-lib', { type: 'commonjs' })
// {
//   id: 'my-lib',
//   path: '/path/to/node_modules/my-lib/index.js',
//   type: 'commonjs'
// }
```

### `isExternal`

```js
import { isExternal } from 'externality'

await isExternal('my-lib', '.')
// {
//   id: 'my-lib',
//   external: true
// }
```

## License

[MIT](./LICENSE)

<!-- Badges -->
[npm-version-src]: https://img.shields.io/npm/v/externality?style=flat-square
[npm-version-href]: https://npmjs.com/package/externality

[npm-downloads-src]: https://img.shields.io/npm/dm/externality?style=flat-square
[npm-downloads-href]: https://npmjs.com/package/externality

[github-actions-src]: https://img.shields.io/github/workflow/status/unjs/externality/ci/main?style=flat-square
[github-actions-href]: https://github.com/unjs/externality/actions?query=workflow%3Aci

[codecov-src]: https://img.shields.io/codecov/c/gh/unjs/externality/main?style=flat-square
[codecov-href]: https://codecov.io/gh/unjs/externality

[bundle-src]: https://img.shields.io/bundlephobia/minzip/externality?style=flat-square
[bundle-href]: https://bundlephobia.com/result?p=externality
