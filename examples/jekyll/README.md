# Jekyll Example

This directory is a brief example of a [Jekyll](https://jekyllrb.com/) site that can be deployed with ZEIT Now and zero configuration.

## Deploy Your Own

Deploy your own Jekyll project with ZEIT Now.

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/new/project?template=https://github.com/zeit/now-examples/tree/master/jekyll)

_Live Example: https://jekyll.now-examples.now.sh_

### How We Created This Example

To get started with Jekyll for deployment with ZEIT Now, you can use the [Jekyll CLI](https://jekyllrb.com/docs/usage/) to initialize the project:

```shell
$ jekyll new my-blog
```

### Deploying From Your Terminal

You can deploy your new Jekyll project with a single command from your terminal using [Now CLI](https://zeit.co/download):

```shell
$ now
```

### Example Changes

This example adds a `package.json` file with the following:

```json
{
  "private": true,
  "scripts": {
    "build": "jekyll build && mv _site public"
  }
}
```

This instructs ZEIT Now to build the Jekyll website and move the output to the public directory.
