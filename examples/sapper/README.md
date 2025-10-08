# Sapper Example

This directory is a brief example of a [Sapper](https://sapper.svelte.dev/) app that can be deployed to Vercel with zero configuration.

## Deploy Your Own

Deploy your own Sapper project with Vercel.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/vercel/tree/main/examples/sapper&template=sapper)

_Live Example: https://sapper-template.vercel.app_

### How We Created This Example

To get started with Sapper deployed with Vercel, you can use [degit](https://github.com/Rich-Harris/degit) to initialize the project:

```shell
$ npx degit "sveltejs/sapper-template#webpack" my-sapper-app
```

> The only change made is to change the build script in `package.json` to be `"sapper export"`.
