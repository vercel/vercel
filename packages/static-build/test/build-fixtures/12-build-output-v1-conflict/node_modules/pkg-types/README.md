# pkg-types

> Node.js utilities and TypeScript definitions for `package.json` and `tsconfig.json`

```
＼⍩⃝／
```

## Install

```sh
# npm
npm i pkg-types

# yarn
yarn add pkg-types
```

## Usage

### `readPackageJSON`

```js
import { readPackageJSON } from 'pkg-types'

const pkg = await readPackageJSON('path/to/package.json')
```

### `writePackageJSON`

```js
import { writePackageJSON } from 'pkg-types'

await writePackageJSON('path/to/package.json', pkg)
```

### `resolvePackageJSON`

```js
import { resolvePackageJSON } from 'pkg-types'
const filename = await resolvePackageJSON()
// or
const packageJson = await resolvePackageJSON('/fully/resolved/path/to/folder')
```

### `readPackageJSON`

```js
import { readPackageJSON } from 'pkg-types'
const filename = await readPackageJSON()
// or
const packageJson = await readPackageJSON('/fully/resolved/path/to/folder')
```

### `readTSConfig`

```js
import { readTSConfig } from 'pkg-types'

const pkg = await readTSConfig('path/to/tsconfig.json')
```

### `writeTSConfig`

```js
import { writeTSConfig } from 'pkg-types'

await writeTSConfig('path/to/tsconfig.json', tsconfig)
```

### `resolveTSConfig`

```js
import { resolveTSConfig } from 'pkg-types'
const filename = await resolveTSConfig()
// or
const tsconfig = await resolveTSConfig('/fully/resolved/path/to/folder')
```

### `readTSConfig`

```js
import { readTSConfig } from 'pkg-types'
const filename = await readTSConfig()
// or
const tsconfig = await readTSConfig('/fully/resolved/path/to/folder')
```

### `resolveFile`

```js
import { resolveFile } from 'pkg-types'
const filename = await resolveFile('README.md', {
  startingFrom: id,
  rootPattern: /^node_modules$/,
  matcher: filename => filename.endsWith('.md'),
})
```

## Types

**Note:** In order to make types working, you need to install `typescript` as a devDependency.

You can directly use typed interfaces:

```ts
import type { TSConfig, PackageJSON } from 'pkg-types'
```

You can also use define utils for type support for using in plain `.js` files and auto-complete in IDE.

```js
import type { definePackageJSON } from 'pkg-types'

const pkg = definePackageJSON({})
```

```js
import type { defineTSConfig } from 'pkg-types'

const pkg = defineTSConfig({})
```

## Alternatives

- [dominikg/tsconfck](https://github.com/dominikg/tsconfck)

## License

MIT - Made with 💛
