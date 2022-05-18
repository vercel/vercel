# node-fetch-native

[![][npm-version-src]][npm-version-href]
[![][github-actions-src]][github-actions-href]
[![][packagephobia-src]][packagephobia-href]
<!-- [![npm downloads][npm-downloads-src]][npm-downloads-href] -->
<!-- [![Codecov][codecov-src]][codecov-href] -->

A redistribution of [node-fetch v3](https://github.com/node-fetch/node-fetch) for better backward and forward compatibility.

**Why this package?**

- We can no longer `require('node-fetch')` with latest version. This stopped popular libraries from upgrading and dependency conflicts between `node-fetch@2` and `node-fetch@3`.
- With upcoming versions of Node.js, native `fetch` is being supported. We are prepared for native fetch support using this package yet keep supporting older Node versions.

**Features:**

✅ Prefer to **native globals** when available (See Node.js [experimental fetch](https://nodejs.org/dist/latest-v17.x/docs/api/cli.html#--experimental-fetch))

✅ Compact build and less install size with **zero dependencies** [![][packagephobia-s-src]][packagephobia-s-href] <sup>vs</sup> [![][packagephobia-s-alt-src]][packagephobia-s-alt-href]

✅ Support both **CommonJS** (`require`) and **ESM** (`import`) usage

✅ Use native version if imported without `node` condition using [conditional exports](https://nodejs.org/api/packages.html#packages_conditional_exports) with **zero bundle overhead**

✅ Polyfill support for Node.js

## Usage

Install `node-fetch-native` dependency:

```sh
# npm
npm i node-fetch-native

# yarn
yarn add node-fetch-native

# pnpm
pnpm i node-fetch-native
```

You can now either import or require the dependency:

```js
// ESM
import fetch from 'node-fetch-native'

// CommonJS
const fetch = require('node-fetch-native')
```

More named exports:

```js
// ESM
import { fetch, Blob, FormData, Headers, Request, Response, AbortController } from 'node-fetch-native'

// CommonJS
const { fetch, Blob, FormData, Headers, Request, Response, AbortController } = require('node-fetch-native')
```

## Polyfill support

Using the polyfill method, we can once ensure global fetch is available in the environment and all files. Natives are always preferred.

**Note:** I don't recommand this if you are authoring a library! Please prefer explicit methods.

```js
// ESM
import 'node-fetch-native/polyfill'

// CJS
require('node-fetch-native/polyfill')

// You can now use fetch() without any import!
```

## Alias to `node-fetch`

Using this method, you can ensure all project dependencies and usages of `node-fetch` can benefit from improved `node-fetch-native` and won't conflict between `node-fetch@2` and `node-fetch@3`.

### npm

Using npm [overrides](https://docs.npmjs.com/cli/v8/configuring-npm/package-json#overrides):

```jsonc
// package.json
{
  "overrides": {
    "node-fetch": "npm:node-fetch-native@latest"
  }
}
```

### yarn

Using yarn [selective dependency resolutions](https://classic.yarnpkg.com/lang/en/docs/selective-version-resolutions/):

```jsonc
// package.json
{
  "resolutions": {
    "node-fetch": "npm:node-fetch-native@latest"
  }
}
```

### pnpm

Using [pnpm.overrides](https://pnpm.io/package_json#pnpmoverrides):

```jsonc
// package.json
{
  "pnpm": {
    "overrides": {
      "node-fetch": "npm:node-fetch-native@latest"
    }
  }
}
```

## License

Made with 💛

[node-fetch is published under the MIT license](https://github.com/node-fetch/node-fetch/blob/main/LICENSE.md)

<!-- Badges -->
[npm-version-src]: https://flat.badgen.net/npm/v/node-fetch-native
[npm-version-href]: https://npmjs.com/package/node-fetch-native

[npm-downloads-src]: https://flat.badgen.net/npm/dm/node-fetch-native
[npm-downloads-href]: https://npmjs.com/package/node-fetch-native

[github-actions-src]: https://flat.badgen.net/github/status/unjs/node-fetch-native/main?style=flat-square
[github-actions-href]: https://github.com/unjs/node-fetch-native/actions?query=workflow%3Aci

[packagephobia-src]: https://flat.badgen.net/packagephobia/install/node-fetch-native
[packagephobia-href]: https://packagephobia.com/result?p=node-fetch-native

[packagephobia-s-src]: https://flat.badgen.net/packagephobia/install/node-fetch-native?label=node-fetch-native&scale=.9
[packagephobia-s-href]: https://packagephobia.com/result?p=node-fetch-native

[packagephobia-s-alt-src]: https://flat.badgen.net/packagephobia/install/node-fetch?label=node-fetch&scale=.9
[packagephobia-s-alt-href]: https://packagephobia.com/result?p=node-fetch
