[npm]: https://img.shields.io/npm/v/@rollup/plugin-wasm
[npm-url]: https://www.npmjs.com/package/@rollup/plugin-wasm
[size]: https://packagephobia.now.sh/badge?p=@rollup/plugin-wasm
[size-url]: https://packagephobia.now.sh/result?p=@rollup/plugin-wasm

[![npm][npm]][npm-url]
[![size][size]][size-url]
[![libera manifesto](https://img.shields.io/badge/libera-manifesto-lightgrey.svg)](https://liberamanifesto.com)

# @rollup/plugin-wasm

🍣 A Rollup which allows importing and bundling [WebAssembly modules](http://webassembly.org).

WebAssembly Modules are imported asynchronous as base64 strings. Small modules [can be imported synchronously](#synchronous-modules).

## Requirements

This plugin requires an [LTS](https://github.com/nodejs/Release) Node version (v8.0.0+) and Rollup v1.20.0+.

## Install

Using npm:

```console
npm install @rollup/plugin-wasm --save-dev
```

## Usage

Create a `rollup.config.js` [configuration file](https://www.rollupjs.org/guide/en/#configuration-files) and import the plugin:

```js
import { wasm } from '@rollup/plugin-wasm';

export default {
  input: 'src/index.js',
  output: {
    dir: 'output',
    format: 'cjs'
  },
  plugins: [wasm()]
};
```

Then call `rollup` either via the [CLI](https://www.rollupjs.org/guide/en/#command-line-reference) or the [API](https://www.rollupjs.org/guide/en/#javascript-api).

## Options

### `sync`

Type: `Array[...String]`<br>
Default: `null`

Specifies an array of strings that each represent a WebAssembly file to load synchronously. See [Synchronous Modules](#synchronous-modules) for a functional example.

### `maxFileSize`

Type: `Number`<br>
Default: `14336` (14kb)

The maximum file size for inline files. If a file exceeds this limit, it will be copied to the destination folder and loaded from a separate file at runtime. If `maxFileSize` is set to `0` all files will be copied.

Files specified in `sync` to load synchronously are always inlined, regardless of size.

### `publicPath`

Type: `String`<br>
Default: (empty string)

A string which will be added in front of filenames when they are not inlined but are copied.

### `targetEnv`

Type: `"auto" | "browser" | "node"`<br>
Default: `"auto"`

Configures what code is emitted to instantiate the Wasm (both inline and separate):

- `"auto"` will determine the environment at runtime and invoke the correct methods accordingly
- `"auto-inline"` always inlines the Wasm and will decode it according to the environment
- `"browser"` omits emitting code that requires node.js builtin modules that may play havoc on downstream bundlers
- `"node"` omits emitting code that requires `fetch`

## WebAssembly Example

Given the following simple C file:

```c
int main() {
  return 42;
}
```

Compile the file using `emscripten`, or the online [WasmFiddle](https://wasdk.github.io/WasmFiddle//) tool. Then import and instantiate the resulting file:

```js
import sample from './sample.wasm';

sample({ ...imports }).then(({ instance }) => {
  console.log(instance.exports.main());
});
```

The WebAssembly is inlined as a base64 encoded string. At runtime the string is decoded and a module is returned.

_Note: The base64 string that represents the WebAssembly within the bundle will be ~33% larger than the original file._

### Synchronous Modules

Small modules (< 4KB) can be compiled synchronously by specifying them in the configuration.

```js
wasm({
  sync: ['web/sample.wasm', 'web/foobar.wasm']
});
```

This means that the exports can be accessed immediately.

```js
import sample from './sample.wasm';

const instance = sample({ ...imports });

console.log(instance.exports.main());
```

## Meta

[CONTRIBUTING](/.github/CONTRIBUTING.md)

[LICENSE (MIT)](/LICENSE)
