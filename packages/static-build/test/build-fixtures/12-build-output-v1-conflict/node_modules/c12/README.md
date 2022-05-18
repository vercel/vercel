# c12

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![Github Actions][github-actions-src]][github-actions-href]
[![Codecov][codecov-src]][codecov-href]

> Smart Configuration Loader

## Features

- JSON, CJS, Typescript and ESM config loader with [unjs/jiti](https://github.com/unjs/jiti)
- RC config support with [unjs/rc9](https://github.com/unjs/rc9)
- Multiple sources merged with [unjs/defu](https://github.com/unjs/defu)
- `.env` support with [dotenv](https://www.npmjs.com/package/dotenv)
- Support extending nested configurations from multiple local or git sources

## Usage

Install package:

```sh
# npm
npm install c12

# yarn
yarn install c12

# pnpm
pnpm install c12
```

Import:

```js
// ESM
import { loadConfig } from 'c12'

// CommonJS
const { loadConfig } = require('c12')
```

Load configuration:

```js
// Get loaded config
const { config } = await loadConfig({})

// Get resolved config and extended layers
const { config, configFile, layers } = await loadConfig({})
```

## Loading priority

c12 merged config sources with [unjs/defu](https://github.com/unjs/defu) by below order:

1. config overrides passed by options
2. config file in CWD
3. RC file in CWD
4. global RC file in user's home directory
5. default config passed by options
6. Extended config layers

## Options

### `cwd`

Resolve configuration from this working directory. Default is `process.cwd()`

### `name`

Configuration base name. Default is `config`.

### `configName`

Configuration file name without extension . Default is generated from `name` (name=foo => `foo.config`).

Set to `false` to avoid loading config file.

### `rcFile`

RC Config file name. Default is generated from `name` (name=foo => `.foorc`).

Set to `false` to disable loading RC config.

### `globalRC`

Load RC config from the user's home directory. Only enabled when `rcFile` is provided. Set to `false` to disable this functionality.

### `dotenv`

Loads `.env` file if enabled. It is disabled by default.

### `defaults`

Specify default configuration. It has the **lowest** priority.

### `overides`

Specify override configuration. It has the **highest** priority.

## Extending configuration

If resolved config contains a `extends` key, it will be used to extend configuration.

Extending can be nested and each layer can extend from one base or more.

Final config is merged result of extended options and user options with [unjs/defu](https://github.com/unjs/defu).

Each item in extends, is a string that can be either an absolute or relative path to current config file pointing to a config file for extending or directory containing config file.
If it starts with either of `github:`, `gitlab:`, `bitbucket:` or `https:`, c12 autmatically clones it.

For custom merging strategies, you can directly access each layer with `layers` property.

**Example:**

```js
// config.ts
export default {
  colors: {
    primary: 'user_primary'
  },
  extends: [
    './theme',
    './config.dev.ts'
  ]
}
```

```js
// config.dev.ts
export default {
  dev: true
}
```

```js
// theme/config.ts
export default {
  extends: '../base',
  colors: {
    primary: 'theme_primary',
    secondary: 'theme_secondary'
  }
}
```

```js
// base/config.ts
export default {
  colors: {
    primary: 'base_primary'
    text: 'base_text'
  }
}
```

Loaded configuration would look like this:

```js
{
  dev: true,
  colors: {
    primary: 'user_primary',
    secondary: 'theme_secondary',
    text: 'base_text'
  }
}
```

Layers:

```js
[
 { config: /* theme config */, configFile: /* path/to/theme/config.ts */, cwd: /* path/to/theme */ },
 { config: /* base  config */, configFile: /* path/to/base/config.ts  */, cwd: /* path/to/base */ },
 { config: /* dev   config */, configFile: /* path/to/config.dev.ts  */, cwd: /* path/ */ },
]
```

## 💻 Development

- Clone this repository
- Enable [Corepack](https://github.com/nodejs/corepack) using `corepack enable` (use `npm i -g corepack` for Node.js < 16.10)
- Install dependencies using `pnpm install`
- Run interactive tests using `pnpm dev`

## License

Made with 💛 Published under [MIT License](./LICENSE).

<!-- Badges -->
[npm-version-src]: https://img.shields.io/npm/v/c12?style=flat-square
[npm-version-href]: https://npmjs.com/package/c12

[npm-downloads-src]: https://img.shields.io/npm/dm/c12?style=flat-square
[npm-downloads-href]: https://npmjs.com/package/c12

[github-actions-src]: https://img.shields.io/github/workflow/status/unjs/c12/ci/main?style=flat-square
[github-actions-href]: https://github.com/unjs/c12/actions?query=workflow%3Aci

[codecov-src]: https://img.shields.io/codecov/c/gh/unjs/c12/main?style=flat-square
[codecov-href]: https://codecov.io/gh/unjs/c12
