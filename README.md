# gatsby-plugin-vercel

This plugin sends [Core Web Vitals](https://web.dev/vitals/) to Vercel Analytics.

## Install

`npm i gatsby-plugin-vercel`

or

`yarn add gatsby-plugin-vercel`

## Usage

The Vercel Analytics project ID will be automically added as an environment variable (`process.env.VERCEL_ANALYTICS_ID`) at build time.

```js
// gatsby-config.js
{
  resolve: 'gatsby-plugin-vercel',
  options: {
    // Prints metrics in the console when true
    debug: false,
  }
}
```

## Inspiration

- [gatsby-plugin-web-vitals](https://github.com/bejamas/gatsby-plugin-web-vitals)
