# Bundle Runner

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![Github Actions][github-actions-src]][github-actions-href]
[![Codecov][codecov-src]][codecov-href]
[![Dependencies][david-dm-src]][david-dm-href]

This package allows running a Webpack bundle in Node.js with optional sandboxed context. Useful for development, loading bundle from memory (HMR) and a consistent way of loading bundle between development and production environments.

**✅ What sandboxing is for:**

- Optional sandboxing using Node.js [VM](https://nodejs.org/api/vm.html)
- Mitigate script evaluation side-effects to global object
- Avoid unwanted shared state
- Avoid memory leaks during HMR

**❌ What sandboxing is not for:**

- Fully avoid side effects of evaluation
- A secure sandbox to run untrusted code
- High performance

## Install

```sh
yarn add bundle-runner

npm install bundle-runner
```

## Usage

```ts
import { createBundle } from 'bundle-runner'

const { evaluateEntry } = createBundle('path/to/bundle.json')

const entry = evaluateEntry(context)
```

**`createBundle`**

```ts
function createBundle(bundle: Partial<Bundle> | string, options?: CreateBundleOptions): {
    bundle: Bundle;
    evaluateEntry: (context: object) => any;
    evaluateModule: (filename: string, context: object) => any;
    rewriteErrorTrace: (err: Error) => Promise<Error>;
}
```

**`CreateBundleOptions`**

```ts
type CreateBundleOptions = {
    basedir?: string;
    runInNewContext?: 'once' | boolean;
    runningScriptOptions?: VM.RunningScriptOptions;
}
```

### Bundle Format

Input can be string (path to a `.js` file or `.json` file with bundle format) or directly bundle object with type of:

```ts
type Bundle = {
    basedir: string;
    entry: string;
    files: {
        [filename: string]: string
    };
    maps: {
        [filename: string]: string
    };
}
```

### SourceMap Support

After creating bundle, a `rewriteErrorTrace` utility is exposed which you can use to rewrite traces:

```ts
const { evaluateEntry, rewriteErrorTrace } = createBundle('path/to/bundle.json')

try {
  const entry = evaluateEntry(context)
  const app = await entry({})
} catch (err) {
  await rewriteErrorTrace(err)
  throw err
}
```

## Credits

Inspired by [vue-server-renderer](https://www.npmjs.com/package/vue-server-renderer) made by [Evan You](https://github.com/yyx990803).

## License

MIT

<!-- Badges -->
[npm-version-src]: https://img.shields.io/npm/v/bundle-runner?style=flat-square
[npm-version-href]: https://npmjs.com/package/bundle-runner

[npm-downloads-src]: https://img.shields.io/npm/dm/bundle-runner?style=flat-square
[npm-downloads-href]: https://npmjs.com/package/bundle-runner

[github-actions-src]: https://img.shields.io/github/workflow/status/nuxt-contrib/bundle-runner/test/master?style=flat-square
[github-actions-href]: https://github.com/nuxt-contrib/bundle-runner/actions?query=workflow%3Atest

[codecov-src]: https://img.shields.io/codecov/c/gh/nuxt-contrib/bundle-runner/master?style=flat-square
[codecov-href]: https://codecov.io/gh/nuxt-contrib/bundle-runner

[david-dm-src]: https://img.shields.io/david/nuxt-contrib/bundle-runner?style=flat-square
[david-dm-href]: https://david-dm.org/nuxt-contrib/bundle-runner
