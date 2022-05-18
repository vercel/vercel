# Rollup Plugin Visualizer

[![NPM Version](https://img.shields.io/npm/v/rollup-plugin-visualizer.svg)](https://npmjs.org/package/rollup-plugin-visualizer) [![Node.js CI](https://github.com/btd/rollup-plugin-visualizer/actions/workflows/node.js.yml/badge.svg)](https://github.com/btd/rollup-plugin-visualizer/actions/workflows/node.js.yml)

Visualize and analyze your Rollup bundle to see which modules are taking up space.

## Screenshots

![pic](https://github.com/btd/rollup-plugin-visualizer/blob/master/pics/collage.png?raw=true)

## Installation

```sh
npm install --save-dev rollup-plugin-visualizer
```

or via yarn:

```sh
yarn add --dev rollup-plugin-visualizer
```

## V5 Upgrade

Version V5 contains seveal minor breaking changes, depending your current installation take such steps before upgrade:

- If you are using rollup v1.x, then you'd better to stay on v4 of plugin. I officially stopped support v1 of rolloup myself. Some versions of 1.x will work without issues, but i stop testing myself or add any changes in this direction. If somebody wants to contibute in this direction - welcome.
- If you use rollup v2.x and use `gzipLength` or `brotliLength`upgrade to rollup 2.44 at least. In V5 i use provided by rollup api to get rendered module code for size estimations, instead of original sources as it was before.
- In all other case just update the plugin.

To upgrade plugin change import/require statement like it is shown in installation section.

## Usage

Import


```javascript
// es
import { visualizer } from 'rollup-plugin-visualizer';
// or
// cjs
const { visualizer } = require('rollup-plugin-visualizer');
```

Usaget with rollup (rollup.config.js)
```js
module.exports = {
  plugins: [
    // put it the last one
    visualizer()
  ]
}
```

Usage with vite (vite.config.js)
```js
module.exports = {
  plugins: [
    visualizer()
  ],
};
```

Usage with SvelteKit (svelte.config.js)
```js
const config = {
  kit: {
    vite: {
      plugins: [
        visualizer(/* TODO add example there */)
      ],
    }
  }
};

export default config;
```

## Options

`filename` (string, default `stats.html`) - name of the file with diagram to generate

`title` (string, default `Rollup Visualizer`) - title tag value

`sourcemap` (boolean, default `false`) - Use sourcemaps to calculate sizes (e.g. after UglifyJs or Terser). **Always add plugin as last option.**

`open` (boolean, default `false`) - Open generated file in default user agent

`template` (string, default `treemap`) - Which diagram type to use: `sunburst`, `treemap`, `network`.

`json` (boolean, default `false`) - Produce portable json file that can be used with plugin CLI util to generate graph from several json files. Every UI property ignored in this case.

`gzipSize` (boolean, default `false`) - Collect gzip size from source code and display it at chart.

`brotliSize` (boolean, default `false`) - Collect brotli size from source code and display it at chart.

`projectRoot` (string | RegExp, default `process.cwd()`) - This is some common root(s) path to your files. This is used to cut absolute files paths out.

## CLI

This plugin provides cli util `rollup-plugin-visualizer`. Add `--help` to check actual options. It can be used like:

```sh
rollup-plugin-visualizer [OPTIONS] stat1.json stat2.json ../stat3.json
```

This can be usefull in case you have different config files in the same project and you want to display all of them in the same chart.

## Build plugin

For development if you need to build plugin, just exec:

```js
npm run build
```

## Disclaimer about generated files

Generated html files do not and never will contain your source code (contents of files). They can contain only js/html/css code required to build chart (plugin code) and statistical information about your source code.

This statistical information can contain:

- size of files included in bundle
- size of files included in source map
- file's paths
- files hierarchy (fs tree for your files)

## Upgrades

See CHANGELOG.md.
