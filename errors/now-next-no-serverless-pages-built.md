# `@vercel/next` No Serverless Pages Built

#### Why This Error Occurred

This error occurs when your application is not configured for Serverless Next.js build output.

#### Possible Ways to Fix It

In order to create the smallest possible lambdas Next.js has to be configured to build for the `serverless` target.

1. Serverless Next.js requires Next.js 8 or later, to upgrade you can install the `latest` version:

```
npm install next --save
```

2. Check [Node.js Version](https://vercel.link/node-version) in your Project Settings. Using an old or incompatible version of Node.js can cause the Build Step to fail with this error message.

3. Add the `now-build` script to your `package.json` [deprecated]

```json
{
  "scripts": {
    "now-build": "next build"
  }
}
```

4. Add `target: 'serverless'` to `next.config.js` [deprecated]

```js
module.exports = {
  target: 'serverless',
  // Other options
};
```

5. Remove `distDir` from `next.config.js` as `@vercel/next` can't parse this file and expects your build output at `/.next`

6. Optionally make sure the `"src"` in `"builds"` points to your application `package.json`

```js
{
  "version": 2,
  "builds": [{ "src": "package.json", "use": "@vercel/next" }]
}
```

6. Make sure you have the correct Node.js version selected for your build step in your project settings (`https://vercel.com/[username]/[project]/settings`)
