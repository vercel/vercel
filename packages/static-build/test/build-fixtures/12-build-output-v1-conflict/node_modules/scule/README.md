# 🧵 Scule

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![Github Actions][github-actions-src]][github-actions-href]
[![Codecov][codecov-src]][codecov-href]
[![bundle][bundle-src]][bundle-href]

<!-- ![](.github/banner.svg) -->

## Install

Install using npm or yarn:

```bash
npm i scule
# or
yarn add scule
```

Import:

```js
// CommonJS
const { pascalCase } = require('scule')

// ESM
import { pascalCase } from 'scule'
```

**Notice:** You may need to transpile package for legacy environments

## Utils

### `pascalCase(str)`

Splits string and joins by PascalCase convention (`foo-bar` => `FooBar`)

**Remarks:**

- If an uppercase letter is followed by other uppercase letters (like `FooBAR`), they are preserved

### `camelCase`

Splits string and joins by camelCase convention (`foo-bar` => `fooBar`)

### `kebabCase(str)`

Splits string and joins by kebab-case convention (`fooBar` => `foo-bar`)

**Remarks:**

- It does **not** preserve case

### `snakeCase`

Splits string and joins by snake_case convention (`foo-bar` => `foo_bar`)

### `upperFirst(str)`

Converts first character to upper case

### `lowerFirst(str)`

Converts first character to lower case

### `splitByCase(str, splitters?)`

- Splits string by the splitters provided (default: `['-', '_', '/', '.]`)
- Splits when case changes from lower to upper (only rising edges)
- Case is preserved in returned value
- Is an irreversible function since splitters are omitted

## License

[MIT](./LICENSE)

<!-- Badges -->
[npm-version-src]: https://img.shields.io/npm/v/scule?style=flat-square
[npm-version-href]: https://npmjs.com/package/scule

[npm-downloads-src]: https://img.shields.io/npm/dm/scule?style=flat-square
[npm-downloads-href]: https://npmjs.com/package/scule

[github-actions-src]: https://img.shields.io/github/workflow/status/nuxt-contrib/scule/ci/main?style=flat-square
[github-actions-href]: https://github.com/nuxt-contrib/scule/actions?query=workflow%3Aci

[codecov-src]: https://img.shields.io/codecov/c/gh/nuxt-contrib/scule/main?style=flat-square
[codecov-href]: https://codecov.io/gh/nuxt-contrib/scule

[bundle-src]: https://img.shields.io/bundlephobia/minzip/scule?style=flat-square
[bundle-href]: https://bundlephobia.com/result?p=scule
