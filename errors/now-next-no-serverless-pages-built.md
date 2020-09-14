# `@now/next` No Serverless Pages Built

#### Why This Error Occurred

This error occurs when your application is not configured for Serverless Next.js build output.

#### Possible Ways to Fix It

In order to create the smallest possible lambdas Next.js has to be configured to build for the `serverless` target.

1. Serverless Next.js requires Next.js 8 or later, to upgrade you can install the `latest` version:

```
npm install next --save
```

2. Add the `now-build` script to your `package.json`

```json
{
  "scripts": {
    "now-build": "next build"
  }
}
```

3. Add `target: 'serverless'` to `next.config.js`

```js
module.exports = {
  target: 'serverless',
  // Other options
};
```

4. Remove `distDir` from `next.config.js` as `@now/next` can't parse this file and expects your build output at `/.next`

5. Optionally make sure the `"src"` in `"builds"` points to your application `package.json`

```js
{
  "version": 2,
  "builds": [{ "src": "package.json", "use": "@now/next" }]
}
```
