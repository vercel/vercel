![Elm Logo](https://github.com/vercel/vercel/blob/master/packages/frameworks/logos/elm.svg)

# Elm Example

This directory is a brief example of an [Elm](https://elm-lang.org/) app that can be deployed with Vercel and zero configuration.

## Deploy Your Own

Deploy your own Elm project with Vercel.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/vercel/vercel/tree/master/examples/create-elm-app)

_Live Example: https://create-elm-app.now-examples.now.sh/_

### How We Created This Example

To get started with Elm with Vercel, you can use the [Create Elm App CLI](https://github.com/halfzebra/create-elm-app#getting-started) to initialize the project:

```shell
$ npx create-elm-app my-app
$ cd my-app
$ npm init
$ npm install --save-dev create-elm-app
& npx dot-json package.json scripts.build "elm-app build"
& npx dot-json package.json scripts.start "elm-app start"
```

### Deploying From Your Terminal

You can deploy your new Elm project with a single command from your terminal using [Vercel CLI](https://vercel.com/download):

```shell
$ vercel
```
