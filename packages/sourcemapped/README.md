# `sourcemapped`

Helpers and utilities to work with source maps.

### `fileToSource(contents: string, sourceName: string, sourcePath?: string): Promise<Source>`

This function takes a `content`, a `sourceName` and an optional `sourcePath` and returns a source map-aware `Source` object. It will first try to load `${sourcePath}.map`, and if it is missing, it will try to load a source map from the given `content`.

```ts
import { sourcemapped, fileToSource } from 'sourcemapped';
import fs from 'fs/promises';
import path from 'path';

const fullSourcePath = path.resolve('my-code-file.js');
const fileContents = await fs.readFile(fullSourcePath, 'utf8');

// Create a `Source` object for the file
const source = await fileToSource(
  fileContents,
  'my-code-file.js',
  fullSourcePath
);
```

### `raw(content: string): Source`

The `raw` function returns a `Source` object with the given `content` with the source name `[native code]`.

### `stringifySourceMap(sourceMap): string`

Stringifies a given source map without the `sourcesContent` property.

### `sourcemapped` tagged template literals

This tagged template literal enables decorating a string while preserving source maps, as a drop-in replacement for a string literal, with source map support.

Each dynamic input of the template literal must be a valid `Source` object, so if you want to add an arbitrary value, make sure to cast it to a `Source` using `raw` or webpack-sources `OriginalSource` constructor.

```ts
import { sourcemapped, fileToSource } from 'sourcemapped';
import fs from 'fs/promises';
import path from 'path';

const fullSourcePath = path.resolve('my-code-file.js');
const fileContents = await fs.readFile(fullSourcePath, 'utf8');

// Create a `Source` object for the file
const source = await fileToSource(
  fileContents,
  'my-code-file.js',
  fullSourcePath
);

const decoratedSource = sourcemapped`
  console.log('before user code');
  ${source}
  console.log('after user code');
`;
```
