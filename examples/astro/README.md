# Astro

This directory is a brief example of an [Astro](https://astro.build/) site that can be deployed to Vercel with zero configuration. This demo showcases:

- `/` - A static page (pre-rendered)
- `/ssr` - A page that uses server-side rendering (through [Vercel Edge Functions](https://vercel.com/docs/functions/edge-functions))
- `/ssr-with-swr-caching` - Similar to the previous page, but also caches the response on the [Vercel Edge Network](https://vercel.com/docs/edge-network/overview) using `cache-control` headers
- `/image` - Astro [Asset](https://docs.astro.build/en/guides/assets/) using Vercel [Image Optimization](https://vercel.com/docs/image-optimization)
- `/edge.json` - An Astro API Endpoint that returns JSON data using [Vercel Edge Functions](https://vercel.com/docs/functions/edge-functions)

Learn more about [Astro on Vercel](https://vercel.com/docs/frameworks/astro).

## Deploy Your Own

Deploy your own Astro project with Vercel.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/vercel/tree/main/examples/astro&template=astro)

_Live Example: https://astro-template.vercel.app_

## Project Structure

Astro looks for `.astro`, `.md`, or `.js` files in the `src/pages/` directory. Each page is exposed as a route based on its file name.

There's nothing special about `src/components/`, but that's where we like to put any Astro/React/Vue/Svelte/Preact components or layouts.

Any static assets, like images, can be placed in the `public/` directory.

## Commands

All commands are run from the root of the project, from a terminal:

| Command                | Action                                             |
| :--------------------- | :------------------------------------------------- |
| `pnpm install`          | Installs dependencies                              |
| `pnpm run dev`          | Starts local dev server at `localhost:3000`        |
| `pnpm run build`        | Build your production site to `./dist/`            |
| `pnpm run preview`      | Preview your build locally, before deploying       |
| `pnpm run start`       | Starts a production dev server at  `localhost:3000`     |
| `pnpm run astro ...`    | Run CLI commands like `astro add`, `astro preview` |
| `pnpm run astro --help` | Get help using the Astro CLI                       |
