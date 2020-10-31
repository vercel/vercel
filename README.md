# gatsby-plugin-vercel

This plugin sends [Core Web Vitals](https://web.dev/vitals/) to Vercel Analytics.

## Install

`npm i gatsby-plugin-vercel`

or

`yarn add gatsby-plugin-vercel`

## Usage

```js
// gatsby-config.js
{
  resolve: 'gatsby-plugin-vercel',
  options: {
    // (required) This env var is automatically added at build time
    projectId: process.env.VERCEL_ANALYTICS_ID,
    // (optional) Prints metrics in the console when true
    debug: false,
  }
}
```

## Inspiration

- [gatsby-plugin-web-vitals](https://github.com/bejamas/gatsby-plugin-web-vitals)
