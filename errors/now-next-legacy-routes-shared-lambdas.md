# `@now/next` Legacy Routes Shared Lambdas Opt-out

#### Why This Warning Occurred

`@vercel/next` by default now bundles pages into shared lambdas to optimize the number of lambdas needed for each application. When legacy `routes` are added in `now.json` or `vercel.json`, they cause conflicts with this optimization so it is opted-out.

#### Possible Ways to Fix It

Migrate from using legacy `routes` to the new `rewrites`, `redirects`, and `headers` configurations in your `now.json` or `vercel.json` file or leverage them directly in your `next.config.js` with the built-in [custom routes support](https://github.com/zeit/next.js/issues/9081)

### Useful Links

- [Rewrites Documentation](https://vercel.com/docs/configuration?query=rewrites#project/rewrites)
- [Redirects Documentation](https://vercel.com/docs/configuration?query=rewrites#project/redirects)
- [Headers Documentation](https://vercel.com/docs/configuration?query=rewrites#project/headers)
