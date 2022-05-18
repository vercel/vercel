# VitePress

This directory is a brief example of a [VitePress](https://vitepress.vuejs.org/) site that can be deployed to Vercel with zero-configuration.

## Deploy Your Own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/vercel/tree/main/examples/vitepress&template=vitepress)

_Live Example: https://vitepress-example.vercel.app_

### How We Created This Example

To get started with VitePress on Vercel, you can [follow their Getting Started steps](https://vitepress.vuejs.org/guide/getting-started.html):

Step. 1: Create and change into a new directory.

```shell
$ mkdir vitepress-starter && cd vitepress-starter
```

Step. 2: Initialize with your preferred package manager.

```shell
$ yarn init
```

Step. 3: Install VitePress locally.

```shell
$ yarn add --dev vitepress
```

Step. 4: Create your first document.

```shell
$ mkdir docs && echo '# Hello VitePress' > docs/index.md
```

Step. 5: Add some scripts to package.json.

```shell
{
  "scripts": {
    "docs:dev": "vitepress dev docs",
    "docs:build": "vitepress build docs",
    "docs:serve": "vitepress serve docs"
  }
}
```
