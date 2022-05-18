# destr

> A faster, secure and convenient alternative for [`JSON.parse`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse):

[![npm version][npm-v-src]][npm-v-href]
[![npm downloads][npm-d-src]][npm-d-href]
[![bundle phobia][bundlephobia-src]][bundlephobia-href]

## Usage

### Node.js

Install using npm or yarn:

```bash
npm i destr
# or
yarn add destr
```

Import into your Node.js project:

```js
// CommonJS
const destr = require('destr')

// ESM
import destr from 'destr'
```

### Deno

```js
import destr from 'https://deno.land/x/destr/src/index.ts'

console.log(destr('{ "deno": "yay" }'))
```

## Why?

Please note that `destr` is little bit slower when parsing a standard JSON string mainly because of transform to avoid [prototype pollution](https://hueniverse.com/a-tale-of-prototype-poisoning-2610fa170061) which can lead to serious security issues if not being sanitized. In the other words, `destr` is better when input is not always a json string or from untrusted source like request body.

**Fast fallback to input if is not string:**

```js
// Uncaught SyntaxError: Unexpected token u in JSON at position 0
JSON.parse()

// undefined
destr()
```

```js
// JSON.parse x 5,324,474 ops/sec ±0.65% (94 runs sampled)
JSON.parse(3.14159265359)

// destr x 657,187,095 ops/sec ±0.06% (98 runs sampled)
destr(3.14159265359)
```

**Fast lookup for known string values:**

```js
// Uncaught SyntaxError: Unexpected token T in JSON at position 0
JSON.parse('TRUE')

// true
destr('TRUE')
```

```js
// JSON.parse x 10,407,488 ops/sec ±0.30% (97 runs sampled)
JSON.parse('true')

// destr x 88,634,032 ops/sec ±0.32% (95 runs sampled)
destr('true')
```

**Fallback to original value if parse fails (empty or any plain string):**

```js
// Uncaught SyntaxError: Unexpected token s in JSON at position 0
// JSON.parse (try-catch) x 248,212 ops/sec ±1.22% (84 runs sampled
JSON.parse('salam')

// destr x 30,867,179 ops/sec ±0.49% (94 runs sampled)
destr('salam')
```

**Avoid prototype pollution:**

```js
const input = '{ "user": { "__proto__": { "isAdmin": true } } }'

// { user: { __proto__: { isAdmin: true } } }
JSON.parse(input)

// { user: {} }
destr(input)
```

## License

MIT. Made with 💖

<!-- Refs -->
[npm-v-src]: https://img.shields.io/npm/v/destr?style=flat-square
[npm-v-href]: https://npmjs.com/package/destr

[npm-d-src]: https://img.shields.io/npm/dm/destr?style=flat-square
[npm-d-href]: https://npmjs.com/package/destr

[github-actions-src]: https://img.shields.io/github/workflow/status/unjs/destr/ci/master?style=flat-square
[github-actions-href]: https://github.com/unjs/destr/actions?query=workflow%3Aci

[bundlephobia-src]: https://img.shields.io/bundlephobia/min/destr?style=flat-square
[bundlephobia-href]: https://bundlephobia.com/result?p=destr
