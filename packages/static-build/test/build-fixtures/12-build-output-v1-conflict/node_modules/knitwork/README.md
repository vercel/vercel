# 🧶 knitwork

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![Github Actions][github-actions-src]][github-actions-href]
[![Codecov][codecov-src]][codecov-href]

> Utilities to generate JavaScript code.

## Install

```sh
# npm
npm install knitwork

# yarn
yarn install knitwork

# pnpm
pnpm install knitwork
```

## Usage

**Generating ESM syntax:**

```js
import { genImport, genExport } from 'knitwork'

// import foo from "pkg"
console.log(genImport('pkg', 'foo'))

// import { foo } from "pkg"
console.log(genImport('pkg', ['foo']))

// import { a, b } from "pkg"
console.log(genImport('pkg', ['a', 'b']))

// import foo as bar from "pkg";
console.log(genImport('pkg', { name: 'foo', as: 'bar' }))

// import { foo as bar } from "pkg";
console.log(genImport('pkg', [{ name: 'foo', as: 'bar' }]))

// export foo from "pkg"
console.log(genExport('pkg', 'foo'))

// export { a, b } from "pkg"
console.log(genExport('pkg', ['a', 'b']))

// export * as bar from "pkg"
console.log(genExport('pkg', { name: '*', as: 'bar' }))
```

**Generating TS:**

```js
import { genInterface, genAugmentation, genInlineTypeImport, genTypeImport, genTypeExport } from 'knitwork'

// interface FooInterface extends A, B {
//   name: boolean
//   optional?: string
// }
console.log(genInterface('FooInterface', { name: 'boolean', 'optional?': 'string' }, { extends: ['A', 'B'] }))
// declare module "my-module" {
//   interface MyInterface {}
// }
console.log(genAugmentation('my-module', { MyInterface: {} }))
// typeof import("my-module").genString'
console.log(genInlineTypeImport('my-module', 'genString'))
// typeof import("my-module").default'
console.log(genInlineTypeImport('my-module'))
// import type { test as value } from "my-module";
console.log(genTypeImport('my-module', [{ name: 'test', as: 'value' }]))
// export type { test } from "my-module";
console.log(genTypeExport('my-module', ['test']))
```

**Serializing JS objects:**

```js
import { genObjectFromRaw, genObjectFromRawEntries, genArrayFromRaw } from 'knitwork'

// { test: () => import("pkg") }
console.log(genObjectFromRaw({ test: '() => import("pkg")' }))

// { 0: [ test, () => import("pkg") ] }
console.log(genObjectFromRaw([ ['test', '() => import("pkg")'] ]))

const entries = Object.entries({
  a: 1, b: null, c: '"c"', nest: { hello: '"world"', fn: () => 1 }
})
// { a: 1, b: null, c: "c", nest: { hello: "world", fn: () => 1 } }
console.log(genObjectFromRawEntries(entries))

// [ 1, 2, () => import("pkg") ]
console.log(genArrayFromRaw(['1', '2', '() => import("pkg")']))
```

## 💻 Development

- Clone this repository
- Enable [Corepack](https://github.com/nodejs/corepack) using `corepack enable` (use `npm i -g corepack` for Node.js < 16.10)
- Install dependencies using `yarn install`
- Run interactive tests using `yarn dev`

## License

Made with 💛

Published under [MIT License](./LICENSE).

<!-- Badges -->
[npm-version-src]: https://img.shields.io/npm/v/knitwork?style=flat-square
[npm-version-href]: https://npmjs.com/package/knitwork

[npm-downloads-src]: https://img.shields.io/npm/dm/knitwork?style=flat-square
[npm-downloads-href]: https://npmjs.com/package/knitwork

[github-actions-src]: https://img.shields.io/github/workflow/status/unjs/knitwork/ci/main?style=flat-square
[github-actions-href]: https://github.com/unjs/knitwork/actions?query=workflow%3Aci

[codecov-src]: https://img.shields.io/codecov/c/gh/unjs/knitwork/main?style=flat-square
[codecov-href]: https://codecov.io/gh/unjs/knitwork
