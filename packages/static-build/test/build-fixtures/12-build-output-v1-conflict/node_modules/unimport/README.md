# unimport

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![Github Actions][github-actions-src]][github-actions-href]
[![Codecov][codecov-src]][codecov-href]

> Unified utils for auto importing APIs in modules

## Install

```sh
# npm
npm install unimport

# yarn
yarn install unimport

# pnpm
pnpm install unimport
```

## Usage

### Plugin Usage

Powered by [unplugin](https://github.com/unjs/unplugin), `unimport` provides a plugin interface for bundlers.

#### Vite / Rollup

```ts
// vite.config.js / rollup.config.js
import Unimport from 'unimport/unplugin'

export default {
  plugins: [
    Unimport.vite({ /* plugin options */ })
  ]
}
```

#### Webpack

```ts
// webpack.config.js
import Unimport from 'unimport/unplugin'

module.exports = {
  plugins: [
    Unimport.webpack({ /* plugin options */ })
  ]
}
```

### Programmatic Usage

```js
// ESM
import { createUnimport } from 'unimport'

// CommonJS
const { createUnimport } = require('unimport')
```

```js
const { injectImports } = createUnimport({
  imports: [{ name: 'fooBar', from: 'test-id' }]
})

// { code: "import { fooBar } from 'test-id';console.log(fooBar())" }
console.log(injectImports('console.log(fooBar())'))
```

## 💻 Development

- Clone this repository
- Enable [Corepack](https://github.com/nodejs/corepack) using `corepack enable` (use `npm i -g corepack` for Node.js < 16.10)
- Install dependencies using `pnpm install`
- Run interactive tests using `pnpm dev`

## License

Made with 💛

Published under [MIT License](./LICENSE).

<!-- Badges -->
[npm-version-src]: https://img.shields.io/npm/v/unimport?style=flat-square
[npm-version-href]: https://npmjs.com/package/unimport

[npm-downloads-src]: https://img.shields.io/npm/dm/unimport?style=flat-square
[npm-downloads-href]: https://npmjs.com/package/unimport

[github-actions-src]: https://img.shields.io/github/workflow/status/unjs/unimport/ci/main?style=flat-square
[github-actions-href]: https://github.com/unjs/unimport/actions?query=workflow%3Aci

[codecov-src]: https://img.shields.io/codecov/c/gh/unjs/unimport/main?style=flat-square
[codecov-href]: https://codecov.io/gh/unjs/unimport
