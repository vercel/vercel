# Runtime Developer Reference

The following page is a reference for how to create a Runtime by implementing
the Runtime API interface. It's a way to add support for a new programming language to Vercel.

> Note: If you're the author of a web framework, please use the [Build Output API](https://vercel.com/docs/build-output-api/v3) instead to make your framework compatible with Vercel.

A Runtime is an npm module that implements the following interface:

```typescript
interface Runtime {
  version: number;
  build: (options: BuildOptions) => Promise<BuildResult>;
  prepareCache?: (options: PrepareCacheOptions) => Promise<CacheOutputs>;
  shouldServe?: (options: ShouldServeOptions) => Promise<boolean>;
  startDevServer?: (
    options: StartDevServerOptions
  ) => Promise<StartDevServerResult>;
}
```

The `version` property and the `build()` function are the only _required_ fields.
The rest are optional extensions that a Runtime _may_ implement in order to
enhance functionality. These functions are documented in more detail below.

Official Runtimes are published to [the npm registry](https://npmjs.com) as a package and referenced in the `use` property of the `vercel.json` configuration file.

> **Note:** The `use` property in the `builds` array will work with any [npm
> install argument](https://docs.npmjs.com/cli/install) such as a git repo URL,
> which is useful for testing your Runtime. Alternatively, the `functions` property
> requires that you specify a specific tag published to npm, for stability purposes.

See the [Runtimes Documentation](https://vercel.com/docs/runtimes) to view example usage.

## Runtime Exports

### `version`

A **required** exported constant that decides which version of the Runtime API to use.

The latest and suggested version is `3`.

**Example:**

```typescript
export const version = 3;
```

### `build()`

A **required** exported function that returns a Serverless Function.

> What's a Serverless Function? Read about [Serverless Functions](https://vercel.com/docs/concepts/functions/serverless-functions) to learn more.

**Example:**

```typescript
import { BuildOptions, createLambda } from '@vercel/build-utils';

export async function build(options: BuildOptions) {
  // Build the code here…

  const lambda = createLambda(/* … */);
  return {
    output: lambda,
    routes: [
      // If your Runtime needs to define additional routing, define it here…
    ],
  };
}
```

### `prepareCache()`

An **optional** exported function that is executed after [`build()`](#build) is
completed. The implementation should return an object of `File`s that will be
pre-populated in the working directory for the next build run in the user's
project. An example use-case is that `@vercel/node` uses this function to cache
the `node_modules` directory, making it faster to install npm dependencies for
future builds.

> Note: Only files within the repo root directory can be cached.

**Example:**

```typescript
import { relative } from 'path';
import { glob, PrepareCache } from '@vercel/build-utils';

export const prepareCache: PrepareCache = async ({
  workPath,
  repoRootPath,
}) => {
  // Create a mapping of file names and `File` object instances to cache here…
  const rootDirectory = relative(repoRootPath, workPath);
  const cache = await glob(`${rootDirectory}/some/dir/**`, repoRootPath);
  return cache;
};
```

### `shouldServe()`

An **optional** exported function that is only used by `vercel dev` in [Vercel
CLI](https://vercel.com/download) and indicates whether a
[Runtime](https://vercel.com/docs/runtimes) wants to be responsible for responding
to a certain request path.

**Example:**

```typescript
import { ShouldServeOptions } from '@vercel/build-utils';

export async function shouldServe(options: ShouldServeOptions) {
  // Determine whether or not the Runtime should respond to the request path here…

  return options.requestPath === options.entrypoint;
}
```

If this function is not defined, Vercel CLI will use the [default
implementation](https://github.com/vercel/vercel/blob/52994bfe26c5f4f179bdb49783ee57ce19334631/packages/now-build-utils/src/should-serve.ts).

### `startDevServer()`

An **optional** exported function that is only used by `vercel dev` in [Vercel
CLI](https://vercel.com/download). If this function is defined, Vercel CLI will
**not** invoke the `build()` function, and instead invoke this function for every
HTTP request. It is an opportunity to provide an optimized development experience
rather than going through the entire `build()` process that is used in production.

This function is invoked _once per HTTP request_ and is expected to spawn a child
process which creates an HTTP server that will execute the entrypoint code when
an HTTP request is received. This child process is _single-serve_ (only used for
a single HTTP request). After the HTTP response is complete, `vercel dev` sends
a shut down signal to the child process.

The `startDevServer()` function returns an object with the `port` number that the
child process' HTTP server is listening on (which should be an [ephemeral
port](https://stackoverflow.com/a/28050404/376773)) as well as the child process'
Process ID, which `vercel dev` uses to send the shut down signal to.

> **Hint:** To determine which ephemeral port the child process is listening on,
> some form of [IPC](https://en.wikipedia.org/wiki/Inter-process_communication) is
> required. For example, in `@vercel/go` the child process writes the port number
> to [_file descriptor 3_](https://en.wikipedia.org/wiki/File_descriptor), which is read by the `startDevServer()` function
> implementation.

It may also return `null` to opt-out of this behavior for a particular request
path or entrypoint.

**Example:**

```typescript
import { spawn } from 'child_process';
import { StartDevServerOptions } from '@vercel/build-utils';

export async function startDevServer(options: StartDevServerOptions) {
  // Create a child process which will create an HTTP server.
  //
  // Note: `my-runtime-dev-server` is an example dev server program name.
  // Your implementation will spawn a different program specific to your runtime.
  const child = spawn('my-runtime-dev-server', [options.entrypoint], {
    stdio: ['ignore', 'inherit', 'inherit', 'pipe'],
  });

  // In this example, the child process will write the port number to FD 3…
  const portPipe = child.stdio[3];
  const childPort = await new Promise(resolve => {
    portPipe.setEncoding('utf8');
    portPipe.once('data', data => {
      resolve(Number(data));
    });
  });

  return { pid: child.pid, port: childPort };
}
```

### Execution Context

- Runtimes are executed in a Linux container that closely matches the Servereless Function runtime environment.
- The Runtime code is executed using Node.js version **12.x**.
- A brand new sandbox is created for each deployment, for security reasons.
- The sandbox is cleaned up between executions to ensure no lingering temporary files are shared from build to build.

All the APIs you export ([`analyze()`](#analyze), [`build()`](#build),
[`prepareCache()`](#preparecache), etc.) are not guaranteed to be run in the
same process, but the filesystem we expose (e.g.: `workPath` and the results
of calling [`getWritableDirectory`](#getWritableDirectory) ) is retained.

If you need to share state between those steps, use the filesystem.

### Directory and Cache Lifecycle

When a new build is created, we pre-populate the `workPath` supplied to `analyze` with the results of the `prepareCache` step of the
previous build.

The `analyze` step can modify that directory, and it will not be re-created when it's supplied to `build` and `prepareCache`.

### Accessing Environment and Secrets

The env and secrets specified by the user as `build.env` are passed to the Runtime process. This means you can access user env via `process.env` in Node.js.

### Supporting Large Environment

We provide the ability to support more than 4KB of environment (up to 64KB) by way of
a Lambda runtime wrapper that is added to every Lambda function we create. These are
supported by many of the existing Lambda runtimes, but custom runtimes may require
additional work.

The following Lambda runtime families have built-in support for the runtime wrapper:

- `nodejs`
- `python` (>= 3.8)
- `ruby`
- `java11`
- `java8.al2` (not `java8`)
- `dotnetcore`

If a custom runtime is based on one of these Lambda runtimes, large environment
support will be available without further configuration. Custom runtimes based on
other Lambda runtimes, including those that provide the runtime via `provided` and
`provided.al2`, must implement runtime wrapper support and indicate it via the
`supportsWrapper` flag when calling [`createLambda`](<#createlambda()>).

To add support for runtime wrappers to a custom runtime, first check the value of the
`AWS_LAMBDA_EXEC_WRAPPER` environment variable in the bootstrap script. Its value is
the path to the wrapper executable.

The wrapper must be passed the path to the runtime as well as any parameters that the
runtime requires. This is most easily done in a small `bootstrap` script.

In this simple `bash` example, the runtime is called directly if
`AWS_LAMBDA_EXEC_WRAPPER` has no value, otherwise the wrapper is called with the
runtime command as parameters.

```bash
#!/bin/bash

exec $AWS_LAMBDA_EXEC_WRAPPER path/to/runtime param1 param2
```

If the `bootstrap` file is not a launcher script, but the entrypoint of the runtime
itself, replace the bootstrap process with the wrapper. Pass the path and parameters
of the executing file, ensuring the `AWS_LAMBDA_EXEC_WRAPPER` environment variable is
set to blank.

This `bash` example uses `exec` to replace the running bootstrap process with the
wrapper, passing its own path and parameters.

```bash
#!/bin/bash

if [[ -n $AWS_LAMBDA_EXEC_WRAPPER ]]
  __WRAPPER=$AWS_LAMBDA_EXEC_WRAPPER
  AWS_LAMBDA_EXEC_WRAPPER=""
  exec $__WRAPPER "$0" "${@}"
fi

# start the actual runtime functionality
```

Note that unsetting the variable may not have the desired effect due to the way
Lambda spawns runtime processes. It is better to explicitly set it to blank.

The best way to replace the existing bootstrap process is with the
[`execve`](https://www.man7.org/linux/man-pages/man2/execve.2.html) syscall.
This is achieved by using `exec` in `bash` to replace the running process with the wrapper,
maintaining the same PID and environment.

Once support for runtime wrappers is included, ensure `supportsWrapper` is set to
`true` in the call to [`createLambda`](<#createlambda()>). This will inform the build
process to enable large environment support for this runtime.

### Utilities as peerDependencies

When you publish your Runtime to npm, make sure to not specify `@vercel/build-utils` (as seen below in the API definitions) as a dependency, but rather as part of `peerDependencies`.

## `@vercel/build-utils` Types

### `Files`

```typescript
import { File } from '@vercel/build-utils';
type Files = { [filePath: string]: File };
```

This is an abstract type that is implemented as a plain [JavaScript Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object). It's helpful to think of it as a virtual filesystem representation.

When used as an input, the `Files` object will only contain `FileRefs`. When `Files` is an output, it may consist of `Lambda` (Serverless Functions) types as well as `FileRefs`.

An example of a valid output `Files` object is:

```javascript
{
  "index.html": FileRef,
  "api/index.js": Lambda
}
```

### `File`

This is an abstract type that can be imported if you are using TypeScript.

```typescript
import { File } from '@vercel/build-utils';
```

Valid `File` types include:

- [`FileRef`](#fileref)
- [`FileFsRef`](#filefsref)
- [`FileBlob`](#fileblob)

### `FileRef`

```typescript
import { FileRef } from '@vercel/build-utils';
```

This is a [class](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes) that represents an abstract file instance stored in our platform, based on the file identifier string (its checksum). When a `Files` object is passed as an input to `analyze` or `build`, all its values will be instances of `FileRef`.

**Properties:**

- `mode: Number` file mode
- `digest: String` a checksum that represents the file

**Methods:**

- `toStream(): Stream` creates a [Stream](https://nodejs.org/api/stream.html) of the file body

### `FileFsRef`

```typescript
import { FileFsRef } from '@vercel/build-utils';
```

This is a [class](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes) that represents an abstract instance of a file present in the filesystem that the build process is executing in.

**Properties:**

- `mode: Number` file mode
- `fsPath: String` the absolute path of the file in file system

**Methods:**

- `static async fromStream({ mode: Number, stream: Stream, fsPath: String }): FileFsRef` creates an instance of a [FileFsRef](#FileFsRef) from `Stream`, placing file at `fsPath` with `mode`
- `toStream(): Stream` creates a [Stream](https://nodejs.org/api/stream.html) of the file body

### `FileBlob`

```typescript
import { FileBlob } from '@vercel/build-utils';
```

This is a [class](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes) that represents an abstract instance of a file present in memory.

**Properties:**

- `mode: Number` file mode
- `data: String | Buffer` the body of the file

**Methods:**

- `static async fromStream({ mode: Number, stream: Stream }): FileBlob` creates an instance of a [FileBlob](#FileBlob) from [`Stream`](https://nodejs.org/api/stream.html) with `mode`
- `toStream(): Stream` creates a [Stream](https://nodejs.org/api/stream.html) of the file body

### `Lambda`

```typescript
import { Lambda } from '@vercel/build-utils';
```

This is a [class](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes) that represents a Serverless Function. An instance can be created by supplying `files`, `handler`, `runtime`, and `environment` as an object to the [`createLambda`](#createlambda) helper. The instances of this class should not be created directly. Instead, invoke the [`createLambda`](#createlambda) helper function.

**Properties:**

- `files: Files` the internal filesystem of the lambda
- `handler: String` path to handler file and (optionally) a function name it exports
- `runtime: LambdaRuntime` the name of the lambda runtime
- `environment: Object` key-value map of handler-related (aside of those passed by user) environment variables
- `supportsWrapper: Boolean` set to true to indicate that Lambda runtime wrappers are supported by this runtime

### `LambdaRuntime`

This is an abstract enumeration type that is implemented by one of the following possible `String` values:

- `nodejs18.x`
- `nodejs16.x`
- `go1.x`
- `java11`
- `python3.9`
- `dotnet6`
- `dotnetcore3.1`
- `ruby2.7`
- `provided.al2`

## `@vercel/build-utils` Helper Functions

The following is exposed by `@vercel/build-utils` to simplify the process of writing Runtimes, manipulating the file system, using the above types, etc.

### `createLambda()`

Signature: `createLambda(Object spec): Lambda`

```typescript
import { createLambda } from '@vercel/build-utils';
```

Constructor for the [`Lambda`](#lambda) type.

```js
const { createLambda, FileBlob } = require('@vercel/build-utils');
await createLambda({
  runtime: 'nodejs8.10',
  handler: 'index.main',
  files: {
    'index.js': new FileBlob({ data: 'exports.main = () => {}' }),
  },
});
```

### `download()`

Signature: `download(): Files`

```typescript
import { download } from '@vercel/build-utils';
```

This utility allows you to download the contents of a [`Files`](#files) data
structure, therefore creating the filesystem represented in it.

Since `Files` is an abstract way of representing files, you can think of
`download()` as a way of making that virtual filesystem _real_.

If the **optional** `meta` property is passed (the argument for
[`build()`](#build)), only the files that have changed are downloaded.
This is decided using `filesRemoved` and `filesChanged` inside that object.

```js
await download(files, workPath, meta);
```

### `glob()`

Signature: `glob(): Files`

```typescript
import { glob } from '@vercel/build-utils';
```

This utility allows you to _scan_ the filesystem and return a [`Files`](#files) representation of the matched glob search string. It can be thought of as the reverse of [`download`](#download).

The following trivial example downloads everything to the filesystem, only to return it back (therefore just re-creating the passed-in [`Files`](#files)):

```js
const { glob, download } = require('@vercel/build-utils');

exports.build = ({ files, workPath }) => {
  await download(files, workPath);
  return glob('**', workPath);
};
```

### `getWritableDirectory()`

Signature: `getWritableDirectory(): String`

```typescript
import { getWritableDirectory } from '@vercel/build-utils';
```

In some occasions, you might want to write to a temporary directory.

### `rename()`

Signature: `rename(Files, Function): Files`

```typescript
import { rename } from '@vercel/build-utils';
```

Renames the keys of the [`Files`](#files) object, which represent the paths. For example, to remove the `*.go` suffix you can use:

```js
const rename = require('@vercel/build-utils')
const originalFiles = { 'one.go': fileFsRef1, 'two.go': fileFsRef2 }
const renamedFiles = rename(originalFiles, path => path.replace(/\.go$/, '')
```
