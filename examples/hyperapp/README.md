# HyperApp Example

This directory is a brief example of a [HyperApp](https://github.com/jorgebucaran/hyperapp) app that can be deployed with ZEIT Now and zero configuration.

## Deploy Your Own

Deploy your own HyperApp project with ZEIT Now.

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/new/project?template=https://github.com/zeit/now/tree/master/examples/hyperapp)

_Live Example: https://hyperapp.now-examples.now.sh_

### How We Created This Example

To get started with HyperApp on Now, you can use the [Now CLI](https://zeit.co/download) to initialize the project:

```shell
$ now init hyperapp
```

> The only change made is to amend the `releaseTarget` to `"public"` in the `taskfile.js` file.

### Deploying From Your Terminal

You can deploy your new HyperApp project with a single command from your terminal using [Now CLI](https://zeit.co/download):

```shell
$ now
```
