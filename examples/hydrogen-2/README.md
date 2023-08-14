# Hydrogen v2

This directory is a brief example of a [Hydrogen v2](https://shopify.dev/custom-storefronts/hydrogen) storefront that can be deployed to Vercel with zero configuration.

## Deploy Your Own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/vercel/tree/main/examples/hydrogen-2&template=hydrogen-2)

_Live Example: https://hydrogen-v2-template.vercel.app_

You can also deploy using the [Vercel CLI](https://vercel.com/cli):

```sh
npm i -g vercel
vercel
```

Hydrogen is Shopify’s stack for headless commerce. Hydrogen is designed to dovetail with [Remix](https://remix.run/), Shopify’s full stack web framework. This template contains a **minimal setup** of components, queries and tooling to get started with Hydrogen.

[Check out Hydrogen docs](https://shopify.dev/custom-storefronts/hydrogen)
[Get familiar with Remix](https://remix.run/docs/en/v1)

## What's included

- Remix
- Hydrogen
- Oxygen
- Shopify CLI
- ESLint
- Prettier
- GraphQL generator
- TypeScript and JavaScript flavors
- Minimal setup of components and routes

## Environment Variables

Using Hydrogen requires a few [environment variables](https://shopify.dev/docs/custom-storefronts/hydrogen/environment-variables) to be set in order to properly connect to Shopify. Set these environment variables to your Project's Environment Variables configuration in the Vercel dashboard (or using the `vc env` commands).

## Local development

Rename the `.env.example` file to `.env` in order for the Shopify dev server to use those environment variables during local development. If you defined/modified additional environment variables based on the section above, be sure to apply those changes in your `.env` file as well.

Then run the following commands:

```bash
npm install
npm run dev
```
