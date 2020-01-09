# Foundation Example

This directory is a brief example of a [Foundation](https://foundation.zurb.com/) site that can be deployed with ZEIT Now and zero configuration.

## Deploy Your Own

Deploy your own Foundation project with ZEIT Now.

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/new/project?template=https://github.com/zeit/now-examples/tree/master/foundation)

_Live Example: https://foundation.now-examples.now.sh_

### How We Created This Example

To get started with Foundation for deployment with ZEIT Now, you can use the [Foundation CLI](https://foundation.zurb.com/sites/docs/installation.html) to initialize the project:

```shell
$ npx foundation new my-foundation-site
```

> The only change made is to amend the output directory in `config.yml` to `"public"`.

### Deploying From Your Terminal

You can deploy your new Foundation project with a single command from your terminal using [Now CLI](https://zeit.co/download):

```shell
$ now
```
