# Sapper Example

This directory is a brief example of a [Sapper](https://sapper.svelte.dev/) app that can be deployed with ZEIT Now and zero configuration.

## Deploy Your Own

Deploy your own Sapper project with ZEIT Now.

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/new/project?template=https://github.com/zeit/now/tree/master/examples/sapper)

_Live Example: https://sapper.now-examples.now.sh_

### How We Created This Example

To get started with Sapper deployed with ZEIT Now, you can use [degit](https://github.com/Rich-Harris/degit) to initialize the project:

```shell
$ npx degit "sveltejs/sapper-template#webpack" my-sapper-app
```

> The only change made is to change the build script in `package.json` to be `"sapper export"`.

### Deploying From Your Terminal

You can deploy your new Sapper project with a single command from your terminal using [Now CLI](https://zeit.co/download):

```shell
$ now
```
