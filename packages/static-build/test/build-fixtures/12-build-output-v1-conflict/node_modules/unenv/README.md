# unenv

Unenv is a framework agnostic system that allows converting JavaScript code to be platform agnostic and working in any environment including Browsers, Workers, Node.js or pure JavaScript runtime.

## Install


```bash
# Using npm
npm i -D unenv

# Using yarn
yarn add --dev unenv
```

## Usage

Using `env` utility and builtin presets ( and [nodeless](./src/presets/nodeless.ts)), unenv will provide an abstract config that can be used in building pipelines ([rollup.js](https://rollupjs.org), [webpack](https://webpack.js.org), etc)

```js
import { env, node, nodeless } from 'unenv'

const { alias, inject, polyfill, external } = env(...presets)
```

## Presets

### `node`

Suitable to convert universal libraries working in Node.js. ([preset]([node](./src/presets/node.ts)))

- Add support for global [`fetch` API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)
- Set Node.js built-ins as externals

### `nodeless`

Using this preset, we can convert a code that is depending on Node.js to work anywhere else.

### Built-in Node.js modules

Unenv provides a replacement for all Node.js built-ins for cross-platform compatiblity.

Module | Status | Source
-------|--------|---------------
[node:assert](https://nodejs.org/api/assert.html) | Mocked | -
[node:async_hooks](https://nodejs.org/api/async_hooks.html) | Mocked | -
[node:buffer](https://nodejs.org/api/buffer.html) | Polyfilled | [unenv/node/buffer](./src/runtime/node/buffer)
[node:child_process](https://nodejs.org/api/child_process.html) | Mocked | -
[node:cluster](https://nodejs.org/api/cluster.html) | Mocked | -
[node:console](https://nodejs.org/api/console.html) | Mocked | -
[node:constants](https://nodejs.org/api/constants.html) | Mocked | -
[node:crypto](https://nodejs.org/api/crypto.html) | Mocked | -
[node:dgram](https://nodejs.org/api/dgram.html) | Mocked | -
[node:diagnostics_channel](https://nodejs.org/api/diagnostics_channel.html) | Mocked | -
[node:dns](https://nodejs.org/api/dns.html) | Mocked | -
[node:domain](https://nodejs.org/api/domain.html) | Mocked | -
[node:events](https://nodejs.org/api/events.html) | Polyfilled | [unenv/node/events](./src/runtime/node/events)
[node:fs](https://nodejs.org/api/fs.html) | Polyfilled | [unenv/node/fs](./src/runtime/node/fs)
[node:fs/promises](https://nodejs.org/api/fs/promises.html) | Polyfilled | [unenv/node/fs/promises](./src/runtime/node/fs/promises)
[node:http2](https://nodejs.org/api/http2.html) | Mocked | -
[node:http](https://nodejs.org/api/http.html) | Polyfilled | [unenv/node/http](./src/runtime/node/http)
[node:https](https://nodejs.org/api/https.html) | Mocked | -
[node:inspector](https://nodejs.org/api/inspector.html) | Mocked | -
[node:module](https://nodejs.org/api/module.html) | Mocked | -
[node:net](https://nodejs.org/api/net.html) | Polyfilled | [unenv/node/net](./src/runtime/node/net)
[node:os](https://nodejs.org/api/os.html) | Mocked | -
[node:path](https://nodejs.org/api/path.html) | Polyfilled | [unenv/node/path](./src/runtime/node/path)
[node:perf_hooks](https://nodejs.org/api/perf_hooks.html) | Mocked | -
[node:process](https://nodejs.org/api/process.html) | Polyfilled | [unenv/node/process](./src/runtime/node/process)
[node:punycode](https://nodejs.org/api/punycode.html) | Mocked | -
[node:querystring](https://nodejs.org/api/querystring.html) | Mocked | -
[node:readline](https://nodejs.org/api/readline.html) | Mocked | -
[node:repl](https://nodejs.org/api/repl.html) | Mocked | -
[node:stream](https://nodejs.org/api/stream.html) | Polyfilled | [unenv/node/stream](./src/runtime/node/stream)
[node:stream/consumers](https://nodejs.org/api/stream.html) | Mocked | [unenv/node/stream/consumers](./src/runtime/node/stream/consumers)
[node:stream/promises](https://nodejs.org/api/stream.html) | Mocked | [unenv/node/stream/promises](./src/runtime/node/stream/promises)
[node:stream/web](https://nodejs.org/api/stream.html) | Native | [unenv/node/stream/web](./src/runtime/node/stream/web)
[node:string_decoder](https://nodejs.org/api/string_decoder.html) | Mocked | -
[node:sys](https://nodejs.org/api/sys.html) | Mocked | -
[node:timers](https://nodejs.org/api/timers.html) | Mocked | -
[node:timers/promises](https://nodejs.org/api/timers.html) | Mocked | -
[node:tls](https://nodejs.org/api/tls.html) | Mocked | -
[node:trace_events](https://nodejs.org/api/trace_events.html) | Mocked | -
[node:tty](https://nodejs.org/api/tty.html) | Mocked | -
[node:url](https://nodejs.org/api/url.html) | Polyfilled | [unenv/node/url](./src/runtime/node/url)
[node:util](https://nodejs.org/api/util.html) | Polyfilled | [unenv/node/util](./src/runtime/node/util)
[node:util/types](https://nodejs.org/api/util.html) | Polyfilled | [unenv/node/util/types](./src/runtime/node/util/types)
[node:v8](https://nodejs.org/api/v8.html) | Mocked | -
[node:vm](https://nodejs.org/api/vm.html) | Mocked | -
[node:wasi](https://nodejs.org/api/wasi.html) | Mocked | -
[node:worker_threads](https://nodejs.org/api/worker_threads.html) | Mocked | -
[node:zlib](https://nodejs.org/api/zlib.html) | Mocked | -

## npm packages

Unenv provides a replacement for common npm packages for cross platform compatibility.

Package | Status | Source
-------|--------|---------------
[npm/consola](https://www.npmjs.com/package/consola) | Use native `console` | [unenv/runtime/npm/consola](./src/runtime/npm/consola.ts)
[npm/cross-fetch](https://www.npmjs.com/package/node-fetch) | Use native `fetch` | [unenv/runtime/npm/cross-fetch](./src/runtime/npm/cross-fetch.ts)
[npm/debug](https://www.npmjs.com/package/debug) | Mocked with `console.debug` | [unenv/runtime/npm/debug](./src/runtime/npm/debug.ts)
[npm/fsevents](https://www.npmjs.com/package/fsevents) | Mocked | [unenv/runtime/npm/fsevents](./src/runtime/npm/fsevents.ts)
[npm/inherits](https://www.npmjs.com/package/inherits) | Inlined | [unenv/runtime/npm/inherits](./src/runtime/npm/inherits.ts)
[npm/mime-db](https://www.npmjs.com/package/mime-db) | Minimized | [unenv/runtime/npm/mime-db](./src/runtime/npm/mime-db.ts)
[npm/mime](https://www.npmjs.com/package/mime) | Minimized | [unenv/runtime/npm/mime](./src/runtime/npm/mime.ts)
[npm/node-fetch](https://www.npmjs.com/package/node-fetch) | Use native `fetch` | [unenv/runtime/npm/node-fetch](./src/runtime/npm/node-fetch.ts)
[npm/whatwg-url](https://www.npmjs.com/package/whatwg-url) | Use native `URL` | [unenv/runtime/npm/whatwg-url](./src/runtime/npm/whatwg-url.ts)

## Auto-mocking proxy

```js
import MockProxy from 'unenv/runtime/mock/proxy'

console.log(MockProxy().foo.bar()[0])
```



Above package doesn't works outside of Node.js and neither we need any platform specific logic! When aliasing `os` to `mock/proxy-cjs`, it will be auto mocked using a [Proxy Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy) which can be recursively traversed like an `Object`, called like a `Function`, Iterated like an `Array`, or instantiated like a `Class`.

We use this proxy for auto mocking unimplemented internals. Imagine a packages does this:

```js
const os = require('os')
if (os.platform() === 'windows') { /* do some fix */ }
module.exports = () => 'Hello world'
```

By aliasing `os` to `unenv/runtime/mock/proxy-cjs`, code will be compatible in other platforms.

## Other polyfilles

Please check [./src/rutime](./src/runtime) to discover other polyfilles.

## License

MIT
