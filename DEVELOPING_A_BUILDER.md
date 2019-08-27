# Builders Developer Reference

The following page is a reference for how to create a Builder using the available Builder's API.

A Builder is an npm module that exposes a `build` function and optionally an `analyze` function and `prepareCache` function.
Official Builders are published to [npmjs.com](https://npmjs.com) as a package and referenced in the `use` property of the `now.json` configuration file.
However, the `use` property will work with any [npm install argument](https://docs.npmjs.com/cli/install) such as a git repo url which is useful for testing your Builder.

See the [Builders Documentation](https://zeit.co/docs/v2/advanced/builders) to view example usage.

## Builder Exports

### `version`

A **required** exported constant that decides which version of the Builder API to use.

The latest and suggested version is `2`.

### `analyze`

An **optional** exported function that returns a unique fingerprint used for the purpose of [build de-duplication](https://zeit.co/docs/v2/advanced/concepts/immutability#deduplication-algorithm). If the `analyze` function is not supplied, a random fingerprint is assigned to each build.

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

A **required** exported function that returns a [Files](#files) data structure that contains the Build outputs, which can be a [Static File](#file) or a [Serverless Function](#serverless-function).

What's a Serverless Function? Read about [Serverless Function concepts](https://zeit.co/docs/v2/deployments/concepts/lambdas) to learn more.

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
  watch: Array<String>,
  output: Files output,
  routes: Object
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

An **optional** exported function that is only used by `now dev` in [Now CLI](https:///download) and indicates whether a [Builder](https://zeit.co/docs/v2/advanced/builders) wants to be responsible for building a certain request path.

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

### Builder Options

The exported functions [`analyze`](#analyze), [`build`](#build), and [`prepareCache`](#preparecache) receive one argument with the following properties.

**Properties:**

- `files`: All source files of the project as a [Files](#files) data structure.
- `entrypoint`: Name of entrypoint file for this particular build job. Value `files[entrypoint]` is guaranteed to exist and be a valid [File](#files) reference. `entrypoint` is always a discrete file and never a glob, since globs are expanded into separate builds at deployment time.
- `workPath`: A writable temporary directory where you are encouraged to perform your build process. This directory will be populated with the restored cache from the previous run (if any) for [`analyze`](#analyze) and [`build`](#build).
- `cachePath`: A writable temporary directory where you can build a cache for the next run. This is only passed to `prepareCache`.
- `config`: An arbitrary object passed from by the user in the [Build definition](#defining-the-build-step) in `now.json`.

## Example: html-minifier

Let's walk through what it takes to create a simple builder that takes in a HTML source file and yields a minified HTML static file as its build output.

While this is a very simple builder, the approach demonstrated here can be used to return anything: one or more static files and/or one or more lambdas.

## Setting up the module

### Defining the analyze step

The `analyze` hook is optional. Its goal is to give the developer a tool to avoid wasting time _re-computing a build_ that has already occurred.

The return value of `analyze` is a _fingerprint_: a simple string that uniquely identifies the build process.

If `analyze` is not specified, its behavior is to use as the fingerprint the combined checksums of **all the files in the same directory level as the entrypoint**. This is a default that errs on making sure that we re-execute builds when files _other than the entrypoint_ (like dependencies, manifest files, etc) have changed.

For our `html-minify` example, we know that HTML files don't have dependencies. Therefore, our analyze step can just return the `digest` of the entrypoint.

Our `index.js` file looks as follows:

```js
exports.analyze = function({ files, entrypoint }) {
  return files[entrypoint].digest
}
```

This means that we will only re-minify and re-create the build output _only if the file contents (and therefore its digest) change._

### Defining the build step

Your module will need some utilities to manipulate the data structures we pass you, create new ones and alter the filesystem.

To that end, we expose our API as part of a `@now/build-utils` package. This package is always loaded on your behalf, so make sure it's only included as `peerDependencies` in your `package.json`.

Builders can include dependencies of their liking:

```js
const htmlMinifier = require('html-minifier')

exports.version = 2

exports.analyze = ({ files, entrypoint }) => files[entrypoint].digest

exports.build = async ({ files, entrypoint, config }) => {
  const stream = files[entrypoint].toStream()
  const options = Object.assign({}, config || {})
  const { data } = await FileBlob.fromStream({ stream })
  const content = data.toString()
  const minified = htmlMinifier(content, options)
  const result = new FileBlob({ data: minified })

  return {
    output: {
      [entrypoint]: result
    },
    watch: [],
    routes: {}
  }
}
```

### Defining a `prepareCache` step

If our builder had performed work that could be re-used in the next build invocation, we could define a `prepareCache` step.

In this case, there are not intermediate artifacts that we can cache, and our `analyze` step already takes care of caching the full output based on the fingerprint of the input.

## Technical Details

### Execution Context

A [Serverless Function](https://zeit.co/docs/v2/advanced/concepts/lambdas) is created where the builder logic is executed. The lambda is run using the Node.js 8 runtime. A brand new sandbox is created for each deployment, for security reasons. The sandbox is cleaned up between executions to ensure no lingering temporary files are shared from build to build.

All the APIs you export ([`analyze`](#analyze), [`build`](#build) and [`prepareCache`](#preparecache)) are not guaranteed to be run in the same process, but the filesystem we expose (e.g.: `workPath` and the results of calling [`getWriteableDirectory`](#getWriteableDirectory) ) is retained.

If you need to share state between those steps, use the filesystem.

### Directory and Cache Lifecycle

When a new build is created, we pre-populate the `workPath` supplied to `analyze` with the results of the `prepareCache` step of the previous build.

The `analyze` step can modify that directory, and it will not be re-created when it's supplied to `build` and `prepareCache`.

To learn how the cache key is computed and invalidated, refer to the [overview](https://zeit.co/docs/v2/advanced/builders#technical-details).

### Accessing Environment and Secrets

The env and secrets specified by the user as `build.env` are passed to the builder process. This means you can access user env via `process.env` in Node.js.

### Utilities as peerDependencies

When you publish your builder to npm, make sure to not specify `@now/build-utils` (as seen below in the API definitions) as a dependency, but rather as part of `peerDependencies`.

## Types

### `Files`

```ts
import { File } from '@now/build-utils'
type Files = { [filePath: string]: File }
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
import { File } from '@now/build-utils'
```

Valid `File` types include:

- [`FileRef`](#fileref)
- [`FileFsRef`](#filefsref)
- [`FileBlob`](#fileblob)

### `FileRef`

```ts
import { FileRef } from '@now/build-utils'
```

This is a [JavaScript class](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes) that represents an abstract file instance stored in our platform, based on the file identifier string (its checksum). When a `Files` object is passed as an input to `analyze` or `build`, all its values will be instances of `FileRef`.

**Properties:**

- `mode : Number` file mode
- `digest : String` a checksum that represents the file

**Methods:**

- `toStream() : Stream` creates a [Stream](https://nodejs.org/api/stream.html) of the file body

### `FileFsRef`

```ts
import { FileFsRef } from '@now/build-utils'
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
import { FileBlob } from '@now/build-utils'
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
import { Lambda } from '@now/build-utils'
```

This is a [JavaScript class](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes), called a Serverless Function, that can be created by supplying `files`, `handler`, `runtime`, and `environment` as an object to the [`createLambda`](#createlambda) helper. The instances of this class should not be created directly. Instead use a call to [`createLambda`](#createlambda).

**Properties:**

- `files : Files` the internal filesystem of the lambda
- `handler : String` path to handler file and (optionally) a function name it exports
- `runtime : LambdaRuntime` the name of the lambda runtime
- `environment : Object` key-value map of handler-related (aside of those passed by user) environment variables

### `LambdaRuntime`

This is an abstract enumeration type that is implemented by one of the following possible `String` values:

- `nodejs10.x`
- `nodejs8.10`
- `go1.x`
- `java-1.8.0-openjdk`
- `python3.6`
- `python2.7`
- `dotnetcore2.1`
- `dotnetcore2.0`
- `dotnetcore1.0`

## JavaScript API

The following is exposed by `@now/build-utils` to simplify the process of writing Builders, manipulating the file system, using the above types, etc.

### `createLambda`

Signature: `createLambda(Object spec) : Lambda`

```ts
import { createLambda } from '@now/build-utils'
```

Constructor for the [`Lambda`](#lambda) type.

```js
const { createLambda, FileBlob } = require('@now/build-utils')
await createLambda({
  runtime: 'nodejs8.10',
  handler: 'index.main',
  files: {
    'index.js': new FileBlob({ data: 'exports.main = () => {}' })
  }
})
```

### `download`

Signature: `download() : Files`

```ts
import { download } from '@now/build-utils'
```

This utility allows you to download the contents of a [`Files`](#files) data structure, therefore creating the filesystem represented in it.

Since `Files` is an abstract way of representing files, you can think of `download` as a way of making that virtual filesystem _real_.

If the **optional** `meta` property is passed (the argument for [build](#build)), only the files that have changed are downloaded. This is decided using `filesRemoved` and `filesChanged` inside that object.

```js
await download(files, workPath, meta)
```

### `glob`

Signature: `glob() : Files`

```ts
import { glob } from '@now/build-utils'
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
import { getWriteableDirectory } from '@now/build-utils'
```

In some occasions, you might want to write to a temporary directory.

### `rename`

Signature: `rename(Files) : Files`

```ts
import { rename } from '@now/build-utils'
```

Renames the keys of the [`Files`](#files) object, which represent the paths. For example, to remove the `*.go` suffix you can use:

```js
const rename = require('@now/build-utils')
const originalFiles = { 'one.go': fileFsRef1, 'two.go': fileFsRef2 }
const renamedFiles = rename(originalFiles, path => path.replace(/\.go$/, '')
```
