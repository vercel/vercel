# Marko.js Example

This directory is a brief example of a [Marko.js](https://markojs.com/) app that can be deployed with ZEIT Now and zero configuration.

## Deploy Your Own

Deploy your own Marko.js project with ZEIT Now.

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/new/project?template=https://github.com/zeit/now-examples/tree/master/marko)

_Live Example: https://marko.now-examples.now.sh_

### How We Created This Example

To get started with Marko.js on Now, you can use the [Marko CLI](https://github.com/marko-js/cli) to initialize the project:

```shell
$ marko create my-project
```

> The only change made is to add `&& mv dist public` to the build script in the `package.json` file.

### Deploying From Your Terminal

You can deploy your new Marko.js project with a single command from your terminal using [Now CLI](https://zeit.co/download):

```shell
$ now
```
