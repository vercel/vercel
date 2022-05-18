# VuePress

This directory is a brief example of a [VuePress](https://vuepress.vuejs.org/) site that can be deployed to Vercel with zero-configuration.

## Deploy Your Own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/vercel/tree/main/examples/vuepress&template=vuepress)

_Live Example: https://vuepress-example.vercel.app_

### How We Created This Example

To get started with VitePress on Vercel, you can [follow their Getting Started steps](https://vuepress.vuejs.org/guide/getting-started.html#manual-installation):

Step. 1: Create and change into a new directory.

```shell
$ mkdir vuepress-starter && cd vuepress-starter
```

Step. 2: Initialize with your preferred package manager.

```shell
$ yarn init
```

Step. 3: Install VitePress locally.

```shell
$ yarn add --dev vuepress
```

Step. 4: Create your first document.

```shell
$ mkdir docs && echo '# Hello VuePress' > docs/README.md
```

Step. 5: Add some scripts to `package.json`.

```shell
{
  "scripts": {
    "docs:dev": "vuepress dev docs",
    "docs:build": "vuepress build docs"
  }
}
```
