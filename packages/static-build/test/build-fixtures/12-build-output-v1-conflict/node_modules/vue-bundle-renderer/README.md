# Vue Bundle Renderer

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![Github Actions][github-actions-src]][github-actions-href]
[![Dependencies][david-dm-src]][david-dm-href]
<!-- [![Codecov][codecov-src]][codecov-href] -->

SSR Bundle Renderer for Vue 3 using [bundle-runner](https://github.com/nuxt-contrib/bundle-runner).

## Install

```sh
yarn add vue-bundle-renderer

npm install vue-bundle-renderer
```

## Usage

### `createRenderer`

```ts
import { createRenderer } from 'vue-bundle-renderer'

declare function createRenderer(createApp:, renderOptions: RenderOptions)
```

### `createBundleRenderer`

```ts
import { createBundleRenderer } from 'vue-bundle-renderer'

declare function createBundleRenderer(bundle, renderOptions: BundleRenderOptions)

type BundleRenderOptions = {
  runInNewContext?: boolean | 'once';
  basedir?: string;
  renderToString: typeof import('@vue/server-renderer').renderToString;
  bundleRunner: typeof import('bundle-runner');
  clientManifest?: ClientManifest;
  publicPath?: string;
}
```

## Credits

Based on [vue-server-renderer](https://www.npmjs.com/package/vue-server-renderer) made by [Evan You](https://github.com/yyx990803).

## License

MIT

<!-- Badges -->
[npm-version-src]: https://img.shields.io/npm/v/vue-bundle-renderer?style=flat-square
[npm-version-href]: https://npmjs.com/package/vue-bundle-renderer

[npm-downloads-src]: https://img.shields.io/npm/dm/vue-bundle-renderer?style=flat-square
[npm-downloads-href]: https://npmjs.com/package/vue-bundle-renderer

[github-actions-src]: https://img.shields.io/github/workflow/status/nuxt-contrib/vue-bundle-renderer/test/master?style=flat-square
[github-actions-href]: https://github.com/nuxt-contrib/vue-bundle-renderer/actions?query=workflow%3Atest

[codecov-src]: https://img.shields.io/codecov/c/gh/nuxt-contrib/vue-bundle-renderer/master?style=flat-square
[codecov-href]: https://codecov.io/gh/nuxt-contrib/vue-bundle-renderer

[david-dm-src]: https://img.shields.io/david/nuxt-contrib/vue-bundle-renderer?style=flat-square
[david-dm-href]: https://david-dm.org/nuxt-contrib/vue-bundle-renderer
