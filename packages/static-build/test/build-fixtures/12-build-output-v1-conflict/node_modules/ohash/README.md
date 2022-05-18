# ohash

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![Github Actions][github-actions-src]][github-actions-href]
[![Codecov][codecov-src]][codecov-href]

> Super fast hashing library based on murmurhash3 written in Vanilla JS

## Usage

Install package:

```sh
# npm
npm install ohash

# yarn
yarn install ohash

# pnpm
pnpm install ohash
```

Import:

```js
// ESM
import { hash, objectHash, murmurHash } from 'ohash'

// CommonJS
const { hash, objectHash, murmurHash } = require('ohash')
```

### `hash(object, options?)`

Converts object value into a string hash using `objectHash` and then applies `murmurHash`.

Usage:

```js
import { hash } from 'ohash'

// "2736179692"
console.log(hash({ foo: 'bar'}))
```

### `objectHash(object, options?)`

Converts a nest object value into a stable and safe string for hashing.

Usage:

```js
import { objectHash } from 'ohash'

// "object:1:string:3:foo:string:3:bar,"
console.log(objectHash({ foo: 'bar'}))
```

### `murmurHash(str)`

Converts input string (of any length) into a 32-bit positive integer using MurmurHash3.

Usage:

```js
import { murmurHash } from 'ohash'

// "2708020327"
console.log(murmurHash('Hello World'))
```

## What is MurmurHash

[MurmurHash](https://en.wikipedia.org/wiki/MurmurHash) is a non-cryptographic hash function created by Austin Appleby.

According to [murmurhash website](https://sites.google.com/site/murmurhash):

✅ Extremely simple - compiles down to ~52 instructions on x86.

✅ Excellent distribution - Passes chi-squared tests for practically all keysets & bucket sizes.

✅ Excellent avalanche behavior - Maximum bias is under 0.5%.

✅ Excellent collision resistance - Passes Bob Jenkin's frog.c torture-test. No collisions possible for 4-byte keys, no small (1- to 7-bit) differentials.

✅ Excellent performance

## 💻 Development

- Clone this repository
- Enable [Corepack](https://github.com/nodejs/corepack) using `corepack enable` (use `npm i -g corepack` for Node.js < 16.10)
- Install dependencies using `pnpm install`
- Run interactive tests using `pnpm dev`

## License

Made with 💛

Published under [MIT License](./LICENSE).

Based on [puleos/object-hash](https://github.com/puleos/object-hash) by [Scott Puleo](https://github.com/puleos/), and implementations from [perezd/node-murmurhash](perezd/node-murmurhash) and
[garycourt/murmurhash-js](https://github.com/garycourt/murmurhash-js) by [Gary Court](mailto:gary.court@gmail.com) and [Austin Appleby](mailto:aappleby@gmail.com).

<!-- Badges -->
[npm-version-src]: https://img.shields.io/npm/v/ohash?style=flat-square
[npm-version-href]: https://npmjs.com/package/ohash

[npm-downloads-src]: https://img.shields.io/npm/dm/ohash?style=flat-square
[npm-downloads-href]: https://npmjs.com/package/ohash

[github-actions-src]: https://img.shields.io/github/workflow/status/unjs/ohash/ci/main?style=flat-square
[github-actions-href]: https://github.com/unjs/ohash/actions?query=workflow%3Aci

[codecov-src]: https://img.shields.io/codecov/c/gh/unjs/ohash/main?style=flat-square
[codecov-href]: https://codecov.io/gh/unjs/ohash
