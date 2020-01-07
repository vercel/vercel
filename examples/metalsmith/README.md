# Metalsmith Example

This directory is a brief example of a [Metalsmith](https://metalsmith.io/) app that can be deployed with ZEIT Now and zero configuration.

## Deploy Your Own

Deploy your own Metalsmith project with ZEIT Now.

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/new/project?template=https://github.com/zeit/now-examples/tree/master/metalsmith)

_Live Example: https://metalsmith.now-examples.now.sh_

### How We Created This Example

To get started with Metalsmith for deployment with ZEIT Now, you can use the [Now CLI](https://zeit.co/download) to initialize the project:

```shell
$ now init metalsmith
```

> The only changes made were to add a build script in `package.json` and change the `destination` in `index.js` to be `"public"`.

### Deploying From Your Terminal

You can deploy your new Metalsmith project with a single command from your terminal using [Now CLI](https://zeit.co/download):

```shell
$ now
```
