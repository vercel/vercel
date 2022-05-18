# fs-memo

> Easy persisted memo object for Node.js

[![npm](https://img.shields.io/npm/dt/fs-memo.svg?style=flat-square)](https://npmjs.com/package/fs-memo)
[![npm (scoped with tag)](https://img.shields.io/npm/v/fs-memo/latest.svg?style=flat-square)](https://npmjs.com/package/fs-memo)

## Usage

Install package:

```bash
yarn add fs-memo
# or
or npm install fs-memo
```

```js
const { getMemo, setMemo } = require('fs-memo')
// or
import { getMemo, setMemo } from 'fs-memo'
```


### `getMemo(options)`

```ts
getMemo(options: MemoOptions): Promise<any>
```

Load latest memo from file-system and combine with local state from CJS cache.

FS loading silently bails if:
 - The process that made memo is still alive with different pid
 - Any fs error happens (like permission denied)

### `setMemo(options)`

```ts
setMemo(memo: object, options: MemoOptions): Promise<void>
```

Update local state from CJS cache and persist memo object to file-system.

FS persistence silently bails if any error happens.

## Options

### `dir`

Specify directory where memo file should be stored. Default dir is `node_modules/.cache/fs-memo`

### `name`

Name of memo file. Default name is `default` (`.json` is appended to file name)

### `file`

Optionally provide full path to file (discards `dir` and `name` options)


## License

MIT
