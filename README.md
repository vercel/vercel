# now-builders

This is a monorepo containing the [Official Builders](https://zeit.co/docs/v2/deployments/builders/overview) provided by the ZEIT team.

There are two branches:

* canary - published to npm as `canary` dist-tag, eg `@now/node@canary`
* master - published to npm as `latest` dist-tag, eg `@now/node@latest`

### Publishing to npm

Run the following command to publish modified builders to npm:

For the stable channel use:

```
yarn publish-stable
```

For the canary channel use:

```
yarn publish-canary
```

GitHub Actions will take care of publishing the updated packages to npm from there.

If for some reason GitHub Actions fails to publish the npm package, you may do so
manually by running `npm publish` from the package directory. Make sure to
use `npm publish --tag canary` if you are publishing a canary release!
