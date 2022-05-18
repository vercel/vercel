![defu](.github/banner.svg)

# 🌊 defu

> Assign default properties, recursively. Lightweight and Fast!

[![Standard JS][standard-src]][standard-href]
[![codecov][codecov-src]][codecov-href]
[![npm version][npm-v-src]][npm-v-href]
[![npm downloads][npm-dm-src]][npm-dm-href]
[![package phobia][packagephobia-src]][packagephobia-href]
[![bundle phobia][bundlephobia-src]][bundlephobia-href]

## Install

Install package:

```bash
# yarn
yarn add defu
# npm
npm install defu
# pnpm
pnpm install defu
```

## Usage

```js
import { defu } from 'defu'

const options = defu(object, ...defaults)
```

Leftmost arguments have more priority when assigning defaults.

### Arguments

- **object (Object):** The destination object.
- **source (Object):** The source object.

```js
import { defu } from 'defu'

console.log(defu({ 'a': { 'b': 2 } }, { 'a': { 'b': 1, 'c': 3 } }))
// => { a: { b: 2, c: 3 } }
```

### Using with CommonJS

```js
const { defu } = require('defu')
```

## Custom Merger

Sometimes default merging strategy is not desirable. Using `createDefu` we can create a custom instance with different merging strategy.

This function accepts `obj` (source object), `key` and `value` (current value) and should return `true` if applied custom merging.

**Example:** Sum numbers instead of overriding

```js
import { createDefu } from 'defu'

const ext = createDefu((obj, key, value) => {
  if (typeof obj[key] === 'number' && typeof value === 'number') {
    obj[key] += val
    return true
  }
})

ext({ cost: 15 }, { cost: 10 }) // { cost: 25 }
```

## Function Merger

Using `defuFn`, if user provided a function, it will be called with default value instead of merging.

I can be useful for default values manipulation.

**Example:** Filter some items from defaults (array) and add 20 to the count default value.

```js
import { defuFn } from 'defu'

defuFn({
  ignore: (val) => val.filter(item => item !== 'dist'),
  count: (count) => count + 20
 }, {
   ignore: ['node_modules','dist'],
   count: 10
 })
 /*
 {
    ignore: ['node_modules'],
    count: 30
  }
  */
```

**Note:** if the default value is not defined, the function defined won't be called and kept as value.

## Array Function Merger

`defuArrayFn` is similar to `defuFn` but **only applies to array values defined in defaults**.

**Example:** Filter some items from defaults (array) and add 20 to the count default value.

```js
import { defuArrayFn } from 'defu'

defuArrayFn({
  ignore(val) => val.filter(i => i !== 'dist'),
  count: () => 20
 }, {
   ignore: [
     'node_modules',
     'dist'
   ],
   count: 10
 })
 /*
  {
    ignore: ['node_modules'],
    count: () => 20
  }
  */
```

**Note:** the function is called only if the value defined in defaults is an aray.

### Remarks

- `object` and `defaults` are not modified
- Nullish values ([`null`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null) and [`undefined`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/undefined)) are skipped. Please use [defaults-deep](https://www.npmjs.com/package/defaults-deep) or [omit-deep](http://npmjs.com/package/omit-deep) or [lodash.defaultsdeep](https://www.npmjs.com/package/lodash.defaultsdeep) if you need to preserve or different behavior.
- Assignment of `__proto__` and `constructor` keys will be skipped to prevent security issues with object pollution.
- Will concat `array` values (if default property is defined)
```js
console.log(defu({ array: ['b', 'c'] }, { array: ['a'] }))
// => { array: ['a', 'b', 'c']}
```

## License

MIT. Made with 💖

<!-- Refs -->
[standard-src]: https://flat.badgen.net/badge/code%20style/standard/green
[standard-href]: https://standardjs.com

[npm-v-src]: https://flat.badgen.net/npm/v/defu/latest
[npm-v-href]: https://npmjs.com/package/defu

[npm-dm-src]: https://flat.badgen.net/npm/dm/defu
[npm-dm-href]: https://npmjs.com/package/defu

[packagephobia-src]: https://flat.badgen.net/packagephobia/install/defu
[packagephobia-href]: https://packagephobia.now.sh/result?p=defu

[bundlephobia-src]: https://flat.badgen.net/bundlephobia/min/defu
[bundlephobia-href]: https://bundlephobia.com/result?p=defu

[codecov-src]: https://flat.badgen.net/codecov/c/github/unjs/defu/master
[codecov-href]: https://codecov.io/gh/unjs/defu
