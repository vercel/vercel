# vite-plugin-checker

A Vite plugin that can run TypeScript, VLS, vue-tsc, ESLint in worker thread.

[![npm version](https://img.shields.io/npm/v/vite-plugin-checker)](https://www.npmjs.com/package/vite-plugin-checker) [![downloads/month](https://img.shields.io/npm/dm/vite-plugin-checker)](https://www.npmtrends.com/vite-plugin-checker) [![Unit Test](https://github.com/fi3ework/vite-plugin-checker/actions/workflows/ci.yml/badge.svg)](https://github.com/fi3ework/vite-plugin-checker/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/fi3ework/vite-plugin-checker/branch/main/graph/badge.svg?token=YCU4HJ66RA)](https://codecov.io/gh/fi3ework/vite-plugin-checker)

## Features

- ⚡️ Speeds up TypeScript, vue-tsc, ESLint, etc. checks by running in a worker thread in serve mode
- 🍀 Works good with vanilla JS / TS, React, Vue2, Vue3
- 💬 Prompt errors in an overlay UI and terminal
- 🌗 Works both in Vite serve and build mode

<p align="center">
  <img alt="screenshot" src="https://user-images.githubusercontent.com/12322740/152739742-7444ee62-9ca7-4379-8f02-495c612ecc5c.png">
</p>

> History version documentations [0.1](https://github.com/fi3ework/vite-plugin-checker/tree/v0.1.x), [0.2](https://github.com/fi3ework/vite-plugin-checker/tree/v0.2), [0.3](https://github.com/fi3ework/vite-plugin-checker/tree/v0.3.x). It's highly recommended to use latest version before 1.0.0, although there's some breaking changes, the plugin configuration is quite simple.

## Online playground

| Examples           | StackBlitz                                                       |
| ------------------ | ---------------------------------------------------------------- |
| Vue3 + vue-tsc     | [⚡️ StackBlitz](https://stackblitz.com/edit/vitejs-vite-p4qsv6) |
| React + TypeScript | [⚡️ StackBlitz](https://stackblitz.com/edit/vitejs-vite-bsdp5b) |
| ESLint             | [⚡️ StackBlitz](https://stackblitz.com/edit/vitejs-vite-xkwqvz) |
| Vue2 + VLS         | [⚡️ StackBlitz](https://stackblitz.com/edit/vitejs-vite-bqtcau) |
| Multiple           | [⚡️ StackBlitz](https://stackblitz.com/edit/vitejs-vite-uetqdg) |

## Getting Started

1. Install plugin.

   ```bash
   pnpm add vite-plugin-checker -D
   ```

2. Add plugin to Vite config file. Add the checker you need. We add TypeScript below as an example. See all available checkers [here](#Checker-configurations).

   ```ts
   // vite.config.js
   import checker from 'vite-plugin-checker'

   export default {
     plugins: [checker({ typescript: true })], // e.g. use TypeScript check
   }
   ```

3. Open localhost page and start development 🚀.

💡 **Caveats**:

1. It's recommended to open a browser for a better terminal flush, see [#27](https://github.com/fi3ework/vite-plugin-checker/pull/27).
2. `server.ws.on` is introduced to Vite in [2.6.8](https://github.com/vitejs/vite/blob/main/packages/vite/CHANGELOG.md#268-2021-10-18). vite-plugin-checker relies on `server.ws.on` to bring diagnostics back after a full reload and it' not available for older version of Vite.

## Checker configurations

For each checker config field below:

- Set to `true` to use a checker with its default value (except ESLint).
- Make sure to install the peer dependencies indicated of each checker.
- Leave the field blank or `false` to disable the checker.
- Checker can be enabled with an advanced object config.

### TypeScript

1. Make sure [typescript](https://www.npmjs.com/package/typescript) is installed as a peer dependency.

2. Add `typescript` field to plugin config.

   ```js
   export default {
     plugins: [checker({ typescript: true /** or an object config */ })],
   }
   ```

   Advanced object configuration table of `options.typescript`

   | field        | Type      | Default value                                         | Description                                                                                                                                                                                                                     |
   | :----------- | --------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | root         | `string`  | [Vite config](https://vitejs.dev/config/#root) `root` | Root path to find tsconfig file                                                                                                                                                                                                 |
   | tsconfigPath | `string`  | `"tsconfig.json"`                                     | Relative tsconfig path to `root`                                                                                                                                                                                                |
   | buildMode    | `boolean` | `false`                                               | Add [`--build`](https://www.typescriptlang.org/docs/handbook/project-references.html) to `tsc` flag, note that `noEmit` does NOT work if `buildMode` is `true` ([#36917](https://github.com/microsoft/TypeScript/issues/36917)) |

### vue-tsc (Volar)

1. Make sure [vue-tsc](https://www.npmjs.com/package/vue-tsc) & [typescript](https://www.npmjs.com/package/typescript) are installed as a peer dependency of your Vite project.

   ⚠️ The `vue-tsc` version must >= `0.33.9`.

   ```bash
   pnpm add vue-tsc@latest typescript -D
   ```

2. Add `vueTsc` field to plugin config.

   ```js
   export default {
     plugins: [checker({ vueTsc: true /** or an object config */ })],
   }
   ```

   Advanced object configuration table of `options.vueTsc`

   | field        | Type     | Default value                                         | Description                      |
   | :----------- | -------- | ----------------------------------------------------- | -------------------------------- |
   | root         | `string` | [Vite config](https://vitejs.dev/config/#root) `root` | Root path to find tsconfig file  |
   | tsconfigPath | `string` | `"tsconfig.json"`                                     | Relative tsconfig path to `root` |

3. (Optional for Vue2 user) The type check is powered by `vue-tsc` so it supports Vue2 according to the [documentation](https://github.com/johnsoncodehk/volar#using), you need to install `@vue/runtime-dom` by yourself.

### ESLint

1. Make sure [eslint](https://www.npmjs.com/package/eslint) and related plugins for your `eslintrc` are installed as peer dependencies.

2. **(Optional but highly recommended)** Install `optionator@^0.9.1` with your package manager. It's needed because of ESLint dependents on it. It's probably working fine even it's not installed as it's accessed as a phantom dependency. But when you set `hoist=false` of pnpm. It won't be accessible anymore without explicit installation.

3. Add `eslint` field to plugin config and `options.eslint.lintCommand` is required. The `lintCommand` is the same as the lint command of your project. The default root of the command uses Vite's [root](https://vitejs.dev/config/#root).

   ```js
   // e.g.
   export default {
     plugins: [
       checker({
         eslint: {
           lintCommand: 'eslint "./src/**/*.{ts,tsx}"', // for example, lint .ts & .tsx
         },
       }),
     ],
   }
   ```

   Advanced object configuration table of `options.eslint`

   | field              | Type                                                                                                       | Default value          | Description                                                                                                                                                                                                              |
   | :----------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
   | lintCommand        | `string`                                                                                                   | This value is required | `lintCommand` will be executed at build mode, and will also be used as default config for dev mode when `eslint.dev.eslint` is nullable.                                                                                 |
   | dev.overrideConfig | [`ESLint.Options`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/eslint/index.d.ts) | `undefined`            | **(Only in dev mode)** You can override the options of the translated from `lintCommand`. Config priority: `const eslint = new ESLint({cwd: root, ...translatedOptions, ...pluginConfig.eslint.dev?.overrideConfig, })`. |
   | dev.logLevel       | `('error' \| 'warning')[]`                                                                                 | `['error', 'warning']` | **(Only in dev mode)** Which level of ESLint should be emitted to terminal and overlay in dev mode                                                                                                                       |

### vls (Vetur)

1. Make sure [vls](https://www.npmjs.com/package/vls) is installed as a peer dependency, plugin will use vls as the check server.

   ```bash
   pnpm add vls -D
   ```

2. Add `vls` field to plugin config.

   ```js
   module.exports = {
     plugins: [checker({ vls: true })],
   }
   ```

   Advanced object configuration of `options.vls`

   VLS configuration accepts the same values that can be configured in VS code with keys that start with `vetur`.
   These are configured with nested objects rather than dotted string notation. TypeScript intellisense is available.

   See [`initParams.ts`](https://github.com/fi3ework/vite-plugin-checker/blob/8fc5d7f4a908a4c80d1cb978e0acf1d4e5700e6a/packages/vite-plugin-checker/src/checkers/vls/initParams.ts#L33) for a comprehensive list of the defaults that can be overridden. Unfortunately, Vetur does not provide a single comprehensive document of all its options.

   For example, to performing checking only the `<script>` block:

   ```ts
   checker({
     vls: {
       vetur: {
         validation: {
           template: false,
           templateProps: false,
           interpolation: false,
           style: false,
         },
       },
     },
   }),
   ```

## Shared configuration

Below is some common configuration to control the behaviors of the plugin.

```ts
{
  /**
   * Show overlay on UI view when there are errors or warnings in dev mode.
   * - Set `true` to show overlay
   * - Set `false` to disable overlay
   * - Set with a object to customize overlay
   *
   * @defaultValue `true`
   */
  overlay:
    | boolean
    | {
        /**
         * Set this true if you want the overlay to default to being open if errors/warnings are found
         * @defaultValue `true`
         */
        initialIsOpen?: boolean
        /**
         * The position of the vite-plugin-checker badge to open and close the diagnostics panel
         * @default `bl`
         */
        position?: 'tl' | 'tr' | 'bl' | 'br'
        /**
         * Use this to add extra style to the badge button, see details of [Svelte style](https://svelte.dev/docs#template-syntax-element-directives-style-property)
         * For example, if you want to hide the badge, you can pass `display: none;` to the badgeStyle property
         */
        badgeStyle?: string
      }
  /**
   * stdout in terminal which starts the Vite server in dev mode.
   * - Set `true` to enable
   * - Set `false` to disable
   *
   * @defaultValue `true`
   */
  terminal: boolean
  /**
   * Enable checking in build mode
   * @defaultValue `true`
   */
  enableBuild: boolean
}
```

## Playground

Run projects in [`playground/*`](./playground) to try it out.

```bash
pnpm i
pnpm run build
cd ./playground/<one_exapmple>    # choose one example
pnpm run dev                      # test in serve mode
pnpm run build                    # test in build mode
```

## License

MIT License © 2022 [fi3ework](https://github.com/fi3ework)

