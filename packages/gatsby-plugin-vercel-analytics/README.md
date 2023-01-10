# @vercel/gatsby-plugin-vercel-analytics

---

⚠️ This repo was migrated from https://github.com/vercel/gatsby-plugin-vercel

It requires Node.js v12 to be built, so the latest, built version of `gatsby-plugin-vercel` has been committed to this repo _temporarily_ so that they can be included in the initial v1 publish of `@vercel/gatsby-plugin-vercel-analytics`.

At some point in the future, this plugin will be updated to Node.js v16 so that it can be included in the rest of this monorepo's build tooling.

---

This plugin sends [Core Web Vitals](https://web.dev/vitals/) to Vercel Analytics. This plugin is configured by default on Vercel. You **do not** need to install it manually. For more information, [read this post](https://vercel.com/blog/gatsby-analytics).

## Install

```bash
npm i @vercel/gatsby-plugin-vercel-analytics
```

or

```bash
pnpm add @vercel/gatsby-plugin-vercel-analytics
```

## Usage

```js
// gatsby-config.js
module.exports = {
  plugins: [
    {
      resolve: "@vercel/gatsby-plugin-vercel-analytics",
      options: {
        // (optional) Prints metrics in the console when true
        debug: false,
      },
    },
  ],
};
```

## Inspiration

- [gatsby-plugin-web-vitals](https://github.com/bejamas/gatsby-plugin-web-vitals)
