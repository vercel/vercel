# unimport

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![Github Actions][github-actions-src]][github-actions-href]
[![Codecov][codecov-src]][codecov-href]

> Unified utils for auto importing APIs in modules

## Features

- Auto import registed APIs for Vite, Webpack or esbuild powered by [unplugin](https://github.com/unjs/unplugin)
- TypeScript declartion file generation
- Auto import for custom APIs defined under specific directories
- Auto import for Vue template

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

## Configurations

### Type Declarations

```ts
Unimport.vite({
  dts: true // or a path to generateed file
})
```

### Directory Auto Import

```ts
Unimport.vite({
  dirs: [
    './composables'
  ]
})
```

Exported APIs for modules under `./composables` will be auto imported.


### Vue Template Auto Import

In Vue's template, usage of APIs are in different context than plain modules. Thus some custom transformation are required. To enable it, set `addons.vueTemplate` to `true`:

```ts
Unimport.vite({
  addons: {
    vueTemplate: true
  }
})
```

#### Caveats

When auto-import a ref, inline operations won't be auto unwrapped.

```ts
export const counter = ref(0)
```

```html
<template>
  <!-- this is ok -->
  <div>{{ counter }}</div>

  <!-- counter here is a ref, this won't work, volar will throw -->
  <div>{{ counter + 1 }}</div>

  <!-- use this instead -->
  <div>{{ counter.value + 1 }}</div>
</template>
```

We recommend using [Volar](https://github.com/johnsoncodehk/volar) for type checking, which will help you to identify the misusage.

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
