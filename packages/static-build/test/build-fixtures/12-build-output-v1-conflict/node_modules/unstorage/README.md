# unstorage

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![Github Actions][github-actions-src]][github-actions-href]
[![Codecov][codecov-src]][codecov-href]
[![bundle][bundle-src]][bundle-href]

> 🌍 💾 Universal Storage Layer


**Why ❓**

Typically, we choose one or more data storages based on our use-cases like a filesystem, a database like Redis, Mongo, or LocalStorage for browsers but it will soon start to be lots of trouble for supporting and combining more than one or switching between them. For javascript library authors, this usually means they have to decide how many platforms they support and implement storage for each.

💡 Unstorage solution is a unified and powerful Key-Value (KV) interface that allows combining drivers that are either built-in or can be implemented via a super simple interface and adding conventional features like mounting, watching, and working with metadata.

Comparing to similar solutions like [localforage](https://localforage.github.io/localForage/), unstorage core is almost 6x smaller (28.9 kB vs 4.7 kB), using modern ESM/Typescript/Async syntax and many more features to be used universally.

<br>
✔️ Works in all environments (Browser, NodeJS, and Workers) <br>
✔️ Multiple built-in drivers (Memory, FS, LocalStorage, HTTP, Redis) <br>
✔️ Asynchronous API <br>
✔️ Unix-style driver mounting to combine storages<br>
✔️ Default in-memory storage <br>
✔️ Tree-shakable utils and tiny core <br>
✔️ Driver native and user provided metadata <br>
✔️ Native aware value serialization and deserialization <br>
✔️ Restore initial state (hydration) <br>
✔️ State snapshot <br>
✔️ Driver agnostic watcher <br>
✔️ HTTP Storage server (cli and programmatic) <br>
✔️ Namespaced storage <br>
<br>
🚧 Overlay storage (copy-on-write) <br>
🚧 Virtual `fs` interface <br>
🚧 Cached storage <br>
🚧 More drivers: MongoDB, S3 and IndexedDB<br>
<br>

**📚 Table of Contents**
<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->

- [Usage](#usage)
- [Storage Interface](#storage-interface)
  - [`storage.hasItem(key)`](#storagehasitemkey)
  - [`storage.getItem(key)`](#storagegetitemkey)
  - [`storage.setItem(key, value)`](#storagesetitemkey-value)
  - [`storage.removeItem(key, removeMeta = true)`](#storageremoveitemkey-removemeta--true)
  - [`storage.getMeta(key, nativeOnly?)`](#storagegetmetakey-nativeonly)
  - [`storage.setMeta(key)`](#storagesetmetakey)
  - [`storage.removeMeta(key)`](#storageremovemetakey)
  - [`storage.getKeys(base?)`](#storagegetkeysbase)
  - [`storage.clear(base?)`](#storageclearbase)
  - [`storage.dispose()`](#storagedispose)
  - [`storage.mount(mountpoint, driver)`](#storagemountmountpoint-driver)
  - [`storage.unmount(mountpoint, dispose = true)`](#storageunmountmountpoint-dispose--true)
  - [`storage.watch(callback)`](#storagewatchcallback)
- [Utils](#utils)
  - [`snapshot(storage, base?)`](#snapshotstorage-base)
  - [`restoreSnapshot(storage, data, base?)`](#restoresnapshotstorage-data-base)
  - [`prefixStorage(storage, data, base?)`](#prefixstoragestorage-data-base)
- [Storage Server](#storage-server)
- [Drivers](#drivers)
  - [`fs` (node)](#fs-node)
  - [`localStorage` (browser)](#localstorage-browser)
  - [`memory` (universal)](#memory-universal)
  - [`overlay` (universal)](#overlay-universal)
  - [`http` (universal)](#http-universal)
  - [`redis`](#redis)
  - [`cloudflare-kv`](#cloudflare-kv)
- [Making custom drivers](#making-custom-drivers)
- [Contribution](#contribution)
- [License](#license)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Usage

Install `unstorage` npm package:

```sh
yarn add unstorage
# or
npm i unstorage
```

```js
import { createStorage } from 'unstorage'

const storage = createStorage(/* opts */)

await storage.getItem('foo:bar') // or storage.getItem('/foo/bar')
```

**Options:**

- `driver`: Default driver (using memory if not provided)

## Storage Interface

### `storage.hasItem(key)`

Checks if storage contains a key. Resolves to either `true` or `false`.

```js
await storage.hasItem('foo:bar')
```

### `storage.getItem(key)`

Gets the value of a key in storage. Resolves to either `string` or `null`.

```js
await storage.getItem('foo:bar')
```

### `storage.setItem(key, value)`

Add/Update a value to the storage.

If the value is not a string, it will be stringified.

If value is `undefined`, it is same as calling `removeItem(key)`.

```js
await storage.setItem('foo:bar', 'baz')
```

### `storage.removeItem(key, removeMeta = true)`

Remove a value (and it's meta) from storage.

```js
await storage.removeItem('foo:bar')
```

### `storage.getMeta(key, nativeOnly?)`

Get metadata object for a specific key.

This data is fetched from two sources:
- Driver native meta (like file creation time)
- Custom meta set by `storage.setMeta` (overrides driver native meta)

```js
await storage.getMeta('foo:bar') // For fs driver returns an object like { mtime, atime, size }
```

### `storage.setMeta(key)`

Set custom meta for a specific key by adding a `$` suffix.

```js
await storage.setMeta('foo:bar', { flag: 1 })
// Same as storage.setItem('foo:bar$', { flag: 1 })
```

### `storage.removeMeta(key)`

Remove meta for a specific key by adding a `$` suffix.

```js
await storage.removeMeta('foo:bar',)
// Same as storage.removeMeta('foo:bar$')
```

### `storage.getKeys(base?)`

Get all keys. Returns an array of strings.

Meta keys (ending with `$`) will be filtered.

If a base is provided, only keys starting with the base will be returned also only mounts starting with base will be queried. Keys still have a full path.

```js
await storage.getKeys()
```

### `storage.clear(base?)`

Removes all stored key/values. If a base is provided, only mounts matching base will be cleared.

```js
await storage.clear()
```

### `storage.dispose()`

Disposes all mounted storages to ensure there are no open-handles left. Call it before exiting process.

**Note:** Dispose also clears in-memory data.

```js
await storage.dispose()
```

### `storage.mount(mountpoint, driver)`

By default, everything is stored in memory. We can mount additional storage space in a Unix-like fashion.

When operating with a `key` that starts with mountpoint, instead of default storage, mounted driver will be called.

```js
import { createStorage } from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'

// Create a storage container with default memory storage
const storage = createStorage({})

storage.mount('/output', fsDriver({ base: './output' }))

//  Writes to ./output/test file
await storage.setItem('/output/test', 'works')

// Adds value to in-memory storage
await storage.setItem('/foo', 'bar')
```

### `storage.unmount(mountpoint, dispose = true)`

Unregisters a mountpoint. Has no effect if mountpoint is not found or is root.

```js
await storage.unmount('/output')
```

### `storage.watch(callback)`

Starts watching on all mountpoints. If driver does not supports watching, only emits even when `storage.*` methods are called.

```js
await storage.watch((event, key) => { })
```

## Utils

### `snapshot(storage, base?)`

Snapshot from all keys in specified base into a plain javascript object (string: string). Base is removed from keys.

```js
import { snapshot } from 'unstorage'

const data = await snapshot(storage, '/etc')
```

### `restoreSnapshot(storage, data, base?)`

Restore snapshot created by `snapshot()`.

```js
await restoreSnapshot(storage, { 'foo:bar': 'baz' }, '/etc2')
```

### `prefixStorage(storage, data, base?)`

Create a namespaced instance of main storage.

All operations are virtually prefixed. Useful to create shorcuts and limit access.

```js
import { createStorage, prefixStorage } from 'unstorage'

const storage = createStorage()
const assetsStorage = prefixStorage(storage, 'assets')

// Same as storage.setItem('assets:x', 'hello!')
await assetsStorage.setItem('x', 'hello!')
```

## Storage Server

We can easily expose unstorage instance to an http server to allow remote connections.
Request url is mapped to key and method/body mapped to function. See below for supported http methods.

**🛡️ Security Note:** Server is unprotected by default. You need to add your own authentication/security middleware like basic authentication.
Also consider that even with authentication, unstorage should not be exposed to untrusted users since it has no protection for abuse (DDOS, Filesystem escalation, etc)

**Programmatic usage:**

```js
import { listen } from 'listhen'
import { createStorage } from 'unstorage'
import { createStorageServer } from 'unstorage/server'

const storage = createStorage()
const storageServer = createStorageServer(storage)

// Alternatively we can use `storage.handle` as a middleware
await listen(storage.handle)
```

**Using CLI:**

```sh
npx unstorage .
```

**Supported HTTP Methods:**

- `GET`: Maps to `storage.getItem`. Returns list of keys on path if value not found.
- `HEAD`: Maps to `storage.hasItem`. Returns 404 if not found.
- `PUT`: Maps to `storage.setItem`. Value is read from body and returns `OK` if operation succeeded.
- `DELETE`: Maps to `storage.removeIterm`. Returns `OK` if operation succeeded.

## Drivers

### `fs` (node)

Maps data to the real filesystem using directory structure for nested keys. Supports watching using [chokidar](https://github.com/paulmillr/chokidar).

This driver implements meta for each key including `mtime` (last modified time), `atime` (last access time), and `size` (file size) using `fs.stat`.

```js
import { createStorage } from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'

const storage = createStorage({
  driver: fsDriver({ base: './tmp' })
})
```

**Options:**

- `base`: Base directory to isolate operations on this directory
- `ignore`: Ignore patterns for watch <!-- and key listing -->
- `watchOptions`: Additional [chokidar](https://github.com/paulmillr/chokidar) options.

### `localStorage` (browser)

Store data in [localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage).

```js
import { createStorage } from 'unstorage'
import localStorageDriver from 'unstorage/drivers/localstorage'

const storage = createStorage({
  driver: localStorageDriver({ base: 'app:' })
})
```

**Options:**

- `base`: Add `${base}:` to all keys to avoid collision
- `localStorage`: Optionally provide `localStorage` object
- `window`: Optionally provide `window` object

### `memory` (universal)

Keeps data in memory using [Set](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set).

By default it is mounted to top level so it is unlikely you need to mount it again.

```js
import { createStorage } from 'unstorage'
import memoryDriver from 'unstorage/drivers/memory'

const storage = createStorage({
  driver: memoryDriver()
})
```

### `overlay` (universal)

This is a special driver that creates a multi-layer overlay driver.

All write operations happen on the top level layer while values are read from all layers.

When removing a key, a special value `__OVERLAY_REMOVED__` will be set on the top level layer internally.

In the example below, we create an in-memory overlay on top of fs. No changes will be actually written to the disk.

```js
import { createStorage } from 'unstorage'
import overlay from 'unstorage/drivers/memory'
import memory from 'unstorage/drivers/memory'
import fs from 'unstorage/drivers/fs'

const storage = createStorage({
  driver: overlay({
    layers: [
      memory(),
      fs({ base: './data' })
    ]
  })
})
```

### `http` (universal)

Use a remote HTTP/HTTPS endpoint as data storage. Supports built-in [http server](#storage-server) methods.

This driver implements meta for each key including `mtime` (last modified time) and `status` from HTTP headers by making a `HEAD` request.

```js
import { createStorage } from 'unstorage'
import httpDriver from 'unstorage/drivers/http'

const storage = createStorage({
  driver: httpDriver({ base: 'http://cdn.com' })
})
```

**Options:**

- `base`: Base URL for urls

**Supported HTTP Methods:**

- `getItem`: Maps to http `GET`. Returns deserialized value if response is ok
- `hasItem`: Maps to http `HEAD`. Returns `true` if response is ok (200)
- `setItem`: Maps to http `PUT`. Sends serialized value using body
- `removeIterm`: Maps to `DELETE`
- `clear`: Not supported

### `redis`

Store data in a redis storage using [ioredis](https://github.com/luin/ioredis).

```js
import { createStorage } from 'unstorage'
import redisDriver from 'unstorage/drivers/redis'

const storage = createStorage({
  driver: redisDriver({
     base: 'storage:'
  })
})
```

**Options:**

- `base`: Prefix all keys with base
- `url`: (optional) connection string

See [ioredis](https://github.com/luin/ioredis/blob/master/API.md#new-redisport-host-options) for all available options.

`lazyConnect` option is enabled by default so that connection happens on first redis operation.


### `cloudflare-kv`

Store data in [Cloudflare KV](https://developers.cloudflare.com/workers/runtime-apis/kv).

You need to create and assign a KV. See [KV Bindings](https://developers.cloudflare.com/workers/runtime-apis/kv#kv-bindings) for more information.

```js
import { createStorage } from 'unstorage'
import cloudflareKVDriver from 'unstorage/drivers/cloudflare-kv'

// Using binding name to be picked from globalThis
const storage = createStorage({
  driver: cloudflareKVDriver({ binding: 'STORAGE' })
})

// Directly setting binding
const storage = createStorage({
  driver: cloudflareKVDriver({ binding: globalThis.STORAGE })
})

// Using from Durable Objects and Workers using Modules Syntax
const storage = createStorage({
  driver: cloudflareKVDriver({ binding: this.env.STORAGE })
})

// Using outside of Cloudflare Workers (like Node.js)
// Not supported Yet!
```

**Options:**

- `binding`: KV binding or name of namespace. Default is `STORAGE`.


## Making custom drivers

It is possible to extend unstorage by creating custom drives.

- Keys are always normalized in `foo:bar` convention
- Mount base is removed
- Returning promise or direct value is optional
- You should cleanup any open watcher and handlers in `dispose`
- Value returned by `getItem` can be a serializable object or string
- Having `watch` method, disables default handler for mountpoint. You are responsible to emit event on `getItem`, `setItem` and `removeItem`.

See [src/drivers](./src/drivers) to inspire how to implement them. Methods can

**Example:**

```js
import { createStorage, defineDriver } from 'unstorage'

const myStorageDriver = defineDriver((_opts) => {
  return {
    async hasItem (key) {},
    async getItem (key) {},
    async setItem(key, value) {},
    async removeItem (key) {},
    async getKeys() {},
    async clear() {},
    async dispose() {},
    // async watch(callback) {}
  }
})

const storage = createStorage({
  driver: myStorageDriver()
})
```

## Contribution

- Clone repository
- Install dependencies with `yarn install`
- Use `yarn dev` to start jest watcher verifying changes
- Use `yarn test` before pushing to ensure all tests and lint checks passing

## License

[MIT](./LICENSE)

<!-- Badges -->
[npm-version-src]: https://img.shields.io/npm/v/unstorage?style=flat-square
[npm-version-href]: https://npmjs.com/package/unstorage

[npm-downloads-src]: https://img.shields.io/npm/dm/unstorage?style=flat-square
[npm-downloads-href]: https://npmjs.com/package/unstorage

[github-actions-src]: https://img.shields.io/github/workflow/status/unjs/unstorage/ci/main?style=flat-square
[github-actions-href]: https://github.com/unjs/unstorage/actions?query=workflow%3Aci

[codecov-src]: https://img.shields.io/codecov/c/gh/unjs/unstorage/main?style=flat-square
[codecov-href]: https://codecov.io/gh/unjs/unstorage

[bundle-src]: https://img.shields.io/bundlephobia/minzip/unstorage?style=flat-square
[bundle-href]: https://bundlephobia.com/result?p=unstorage
