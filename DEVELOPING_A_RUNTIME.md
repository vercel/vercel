# Runtime Developer Reference

The following page is a reference for how to create a Runtime using the available Runtime API.

A Runtime is an npm module that exposes a `build` function and optionally an `analyze` function and `prepareCache` function.
Official Runtimes are published to [npmjs.com](https://npmjs.com) as a package and referenced in the `use` property of the `vercel.json` configuration file.
However, the `use` property will work with any [npm install argument](https://docs.npmjs.com/cli/install) such as a git repo url which is useful for testing your Runtime.

See the [Runtimes Documentation](https://vercel.com/docs/runtimes) to view example usage.

## Runtime Exports

### `version`

A **required** exported constant that decides which version of the Runtime API to use.

The latest and suggested version is `3`.

### `analyze`

An **optional** exported function that returns a unique fingerprint used for the purpose of [build de-duplication](https://vercel.com/docs/v2/platform/deployments#deduplication). If the `analyze` function is not supplied, a random fingerprint is assigned to each build.

```js
export analyze({
  files: Files,
  entrypoint: String,
  workPath: String,
  config: Object
}) : String fingerprint
```

If you are using TypeScript, you should use the following types:

```ts
import { AnalyzeOptions } from '@now/build-utils'

export analyze(options: AnalyzeOptions) {
  return 'fingerprint goes here'
}
```

### `build`

A **required** exported function that returns a [Serverless Function](#serverless-function).

What's a Serverless Function? Read about [Serverless Functions](https://vercel.com/docs/v2/serverless-functions/introduction) to learn more.

```js
build({
  files: Files,
  entrypoint: String,
  workPath: String,
  config: Object,
  meta?: {
    isDev?: Boolean,
    requestPath?: String,
    filesChanged?: Array<String>,
    filesRemoved?: Array<String>
  }
}) : {
  watch?: Array<String>,
  output: Lambda,
  routes?: Object
}
```

If you are using TypeScript, you should use the following types:

```ts
import { BuildOptions } from '@now/build-utils'

export build(options: BuildOptions) {
  // Build the code here

  return {
    output: {
      'path-to-file': File,
      'path-to-lambda': Lambda
    },
    watch: [],
    routes: {}
  }
}
```

### `prepareCache`

An **optional** exported function that is equivalent to [`build`](#build), but it executes the instructions necessary to prepare a cache for the next run.

```js
prepareCache({
  files: Files,
  entrypoint: String,
  workPath: String,
  cachePath: String,
  config: Object
}) : Files cacheOutput
```

If you are using TypeScript, you can import the types for each of these functions by using the following:

```ts
import { PrepareCacheOptions } from '@now/build-utils'

export prepareCache(options: PrepareCacheOptions) {
  return { 'path-to-file': File }
}
```

### `shouldServe`

An **optional** exported function that is only used by `now dev` in [Now CLI](https:///download) and indicates whether a [Runtime](https://vercel.com/docs/runtimes) wants to be responsible for building a certain request path.

```js
shouldServe({
  entrypoint: String,
  files: Files,
  config: Object,
  requestPath: String,
  workPath: String
}) : Boolean
```

If you are using TypeScript, you can import the types for each of these functions by using the following:

```ts
import { ShouldServeOptions } from '@now/build-utils'

export shouldServe(options: ShouldServeOptions) {
  return Boolean
}
```

If this method is not defined, Now CLI will default to [this function](https://github.com/zeit/now/blob/52994bfe26c5f4f179bdb49783ee57ce19334631/packages/now-build-utils/src/should-serve.ts).

### Runtime Options

The exported functions [`analyze`](#analyze), [`build`](#build), and [`prepareCache`](#preparecache) receive one argument with the following properties.

**Properties:**

- `files`: All source files of the project as a [Files](#files) data structure.
- `entrypoint`: Name of entrypoint file for this particular build job. Value `files[entrypoint]` is guaranteed to exist and be a valid [File](#files) reference. `entrypoint` is always a discrete file and never a glob, since globs are expanded into separate builds at deployment time.
- `workPath`: A writable temporary directory where you are encouraged to perform your build process. This directory will be populated with the restored cache from the previous run (if any) for [`analyze`](#analyze) and [`build`](#build).
- `cachePath`: A writable temporary directory where you can build a cache for the next run. This is only passed to `prepareCache`.
- `config`: An arbitrary object passed from by the user in the [Build definition](#defining-the-build-step) in `vercel.json`.

## Examples

Check out our [Node.js Runtime](https://github.com/zeit/now/tree/master/packages/now-node), [Go Runtime](https://github.com/zeit/now/tree/master/packages/now-go), [Python Runtime](https://github.com/zeit/now/tree/master/packages/now-python) or [Ruby Runtime](https://github.com/zeit/now/tree/master/packages/now-ruby) for examples of how to build one.

## Technical Details

### Execution Context

A [Serverless Function](https://vercel.com/docs/v2/serverless-functions/introduction) is created where the Runtime logic is executed. The lambda is run using the Node.js 8 runtime. A brand new sandbox is created for each deployment, for security reasons. The sandbox is cleaned up between executions to ensure no lingering temporary files are shared from build to build.

All the APIs you export ([`analyze`](#analyze), [`build`](#build) and [`prepareCache`](#preparecache)) are not guaranteed to be run in the same process, but the filesystem we expose (e.g.: `workPath` and the results of calling [`getWriteableDirectory`](#getWriteableDirectory) ) is retained.

If you need to share state between those steps, use the filesystem.

### Directory and Cache Lifecycle

When a new build is created, we pre-populate the `workPath` supplied to `analyze` with the results of the `prepareCache` step of the previous build.

The `analyze` step can modify that directory, and it will not be re-created when it's supplied to `build` and `prepareCache`.

### Accessing Environment and Secrets

The env and secrets specified by the user as `build.env` are passed to the Runtime process. This means you can access user env via `process.env` in Node.js.

### Utilities as peerDependencies

When you publish your Runtime to npm, make sure to not specify `@now/build-utils` (as seen below in the API definitions) as a dependency, but rather as part of `peerDependencies`.

## Types

### `Files`

```ts
import { File } from '@now/build-utils';
type Files = { [filePath: string]: File };
```

This is an abstract type that is implemented as a plain [JavaScript Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object). It's helpful to think of it as a virtual filesystem representation.

When used as an input, the `Files` object will only contain `FileRefs`. When `Files` is an output, it may consist of `Lambda` (Serverless Functions) types as well as `FileRefs`.

An example of a valid output `Files` object is:

```json
{
  "index.html": FileRef,
  "api/index.js": Lambda
}
```

### `File`

This is an abstract type that can be imported if you are using TypeScript.

```ts
import { File } from '@now/build-utils';
```

Valid `File` types include:

- [`FileRef`](#fileref)
- [`FileFsRef`](#filefsref)
- [`FileBlob`](#fileblob)

### `FileRef`

```ts
import { FileRef } from '@now/build-utils';
```

This is a [JavaScript class](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes) that represents an abstract file instance stored in our platform, based on the file identifier string (its checksum). When a `Files` object is passed as an input to `analyze` or `build`, all its values will be instances of `FileRef`.

**Properties:**

- `mode : Number` file mode
- `digest : String` a checksum that represents the file

**Methods:**

- `toStream() : Stream` creates a [Stream](https://nodejs.org/api/stream.html) of the file body

### `FileFsRef`

```ts
import { FileFsRef } from '@now/build-utils';
```

This is a [JavaScript class](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes) that represents an abstract instance of a file present in the filesystem that the build process is executing in.

**Properties:**

- `mode : Number` file mode
- `fsPath : String` the absolute path of the file in file system

**Methods:**

- `static async fromStream({ mode : Number, stream : Stream, fsPath : String }) : FileFsRef` creates an instance of a [FileFsRef](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object) from `Stream`, placing file at `fsPath` with `mode`
- `toStream() : Stream` creates a [Stream](https://nodejs.org/api/stream.html) of the file body

### `FileBlob`

```ts
import { FileBlob } from '@now/build-utils';
```

This is a [JavaScript class](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes) that represents an abstract instance of a file present in memory.

**Properties:**

- `mode : Number` file mode
- `data : String | Buffer` the body of the file

**Methods:**

- `static async fromStream({ mode : Number, stream : Stream }) :FileBlob` creates an instance of a [FileBlob](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object) from [`Stream`](https://nodejs.org/api/stream.html) with `mode`
- `toStream() : Stream` creates a [Stream](https://nodejs.org/api/stream.html) of the file body

### `Lambda`

```ts
import { Lambda } from '@now/build-utils';
```

This is a [JavaScript class](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes), called a Serverless Function, that can be created by supplying `files`, `handler`, `runtime`, and `environment` as an object to the [`createLambda`](#createlambda) helper. The instances of this class should not be created directly. Instead, invoke the [`createLambda`](#createlambda) helper function.

**Properties:**

- `files : Files` the internal filesystem of the lambda
- `handler : String` path to handler file and (optionally) a function name it exports
- `runtime : LambdaRuntime` the name of the lambda runtime
- `environment : Object` key-value map of handler-related (aside of those passed by user) environment variables

### `LambdaRuntime`

This is an abstract enumeration type that is implemented by one of the following possible `String` values:

- `nodejs12.x`
- `nodejs10.x`
- `go1.x`
- `java11`
- `python3.8`
- `python3.6`
- `dotnetcore2.1`
- `ruby2.5`
- `provided`

## JavaScript API

The following is exposed by `@now/build-utils` to simplify the process of writing Runtimes, manipulating the file system, using the above types, etc.

### `createLambda`

Signature: `createLambda(Object spec) : Lambda`

```ts
import { createLambda } from '@now/build-utils';
```

Constructor for the [`Lambda`](#lambda) type.

```js
const { createLambda, FileBlob } = require('@now/build-utils');
await createLambda({
  runtime: 'nodejs8.10',
  handler: 'index.main',
  files: {
    'index.js': new FileBlob({ data: 'exports.main = () => {}' }),
  },
});
```

### `download`

Signature: `download() : Files`

```ts
import { download } from '@now/build-utils';
```

This utility allows you to download the contents of a [`Files`](#files) data structure, therefore creating the filesystem represented in it.

Since `Files` is an abstract way of representing files, you can think of `download` as a way of making that virtual filesystem _real_.

If the **optional** `meta` property is passed (the argument for [build](#build)), only the files that have changed are downloaded. This is decided using `filesRemoved` and `filesChanged` inside that object.

```js
await download(files, workPath, meta);
```

### `glob`

Signature: `glob() : Files`

```ts
import { glob } from '@now/build-utils';
```

This utility allows you to _scan_ the filesystem and return a [`Files`](#files) representation of the matched glob search string. It can be thought of as the reverse of [`download`](#download).

The following trivial example downloads everything to the filesystem, only to return it back (therefore just re-creating the passed-in [`Files`](#files)):

```js
const { glob, download } = require('@now/build-utils')

exports.build = ({ files, workPath }) => {
  await download(files, workPath)
  return glob('**', workPath)
}
```

### `getWriteableDirectory`

Signature: `getWriteableDirectory() : String`

```ts
import { getWriteableDirectory } from '@now/build-utils';
```

In some occasions, you might want to write to a temporary directory.

### `rename`

Signature: `rename(Files) : Files`

```ts
import { rename } from '@now/build-utils';
```

Renames the keys of the [`Files`](#files) object, which represent the paths. For example, to remove the `*.go` suffix you can use:

```js
const rename = require('@now/build-utils')
const originalFiles = { 'one.go': fileFsRef1, 'two.go': fileFsRef2 }
const renamedFiles = rename(originalFiles, path => path.replace(/\.go$/, '')
```
