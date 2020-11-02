# gatsby-plugin-vercel

This plugin sends [Core Web Vitals](https://web.dev/vitals/) to Vercel Analytics.

## Install

```bash
npm i gatsby-plugin-vercel
```

or

```bash
yarn add gatsby-plugin-vercel
```

## Usage

```js
// gatsby-config.js
{
  resolve: 'gatsby-plugin-vercel',
  options: {
    // (optional) Prints metrics in the console when true
    debug: false,
  }
}
```

## Inspiration

- [gatsby-plugin-web-vitals](https://github.com/bejamas/gatsby-plugin-web-vitals)
