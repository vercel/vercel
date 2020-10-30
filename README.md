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
    projectId: 'a8h8lk23df89kl25',
    // Prints metrics in the console when true
    debug: false,
  }
}
```
