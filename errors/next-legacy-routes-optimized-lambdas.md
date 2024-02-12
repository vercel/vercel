# `@vercel/next` Legacy Routes Optimized Lambdas Opt-out

#### Why This Warning Occurred

`@vercel/next` by default now bundles pages into optimized functions, minimizing bootup time and increasing overall application throughput.
When legacy `routes` are added in `now.json` or `vercel.json`, they cause conflicts with this optimization, so it is opted-out.

#### Possible Ways to Fix It

Migrate from using legacy `routes` to the new `rewrites`, `redirects`, and `headers` configurations in your `now.json` or `vercel.json` file or leverage them directly in your `next.config.js` with the built-in [custom routes support](https://github.com/vercel/next.js/issues/9081)

### Useful Links

- [Rewrites Documentation](https://vercel.com/docs/concepts/projects/project-configuration#rewrites)
- [Redirects Documentation](https://vercel.com/docs/concepts/projects/project-configuration#redirects)
- [Headers Documentation](https://vercel.com/docs/concepts/projects/project-configuration#headers)
