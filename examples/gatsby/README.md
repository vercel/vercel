# Gatsby

This directory is a brief example of a [Gatsby](https://www.gatsbyjs.org/) app with [Serverless Functions](https://vercel.com/docs/concepts/functions/serverless-functions) that can be deployed to Vercel with zero configuration.

## Deploy Your Own

Deploy your own Gatsby project, along with Serverless Functions, with Vercel.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/vercel/tree/main/examples/gatsby&template=gatsby)

_Live Example: https://gatsby.vercel.app_

## Running Locally

> **Note:** [Gatsby Functions](https://www.gatsbyjs.com/docs/reference/functions/getting-started/) are not yet supported on Vercel, which is why the API Route is in `/api` instead of `/src/api`.

To run your Gatsby application and your API Route, you'll need to use the [Vercel CLI](https://vercel.com/cli):

```shell
$ npm i -g vercel
$ vercel
```

Alternatively, you can remove the API and just use Gatsby:

```shell
$ yarn develop
```
