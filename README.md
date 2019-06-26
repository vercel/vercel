# now-builders

This is a monorepo containing the [Official Builders](https://zeit.co/docs/v2/deployments/builders/overview) provided by the ZEIT team.

## Channels

There are two Channels:

| Channel | Git Branch | npm dist-tag | use example        |
| ------- | ---------- | ------------ | ------------------ |
| Canary  | `canary`   | `@canary`    | `@now/node@canary` |
| Stable  | `master`   | `@latest`    | `@now/node@latest` |

All PRs should be submitted to the `canary` branch.

Once a PR is merged into the `canary` branch, it should be published to npm immediately using the Canary Channel.

### Publishing to npm

For the Canary Channel, publish the modified Builders to npm with the following:

```
yarn publish-canary
```

For the Stable Channel, you must do the following:

- Cherry pick each commit from canary to master
- Verify that you are _in-sync_ with canary (with the exception of the `version` line in `package.json`)
- Deploy the modified Builders

```
git checkout master
git pull      # make sure you're up to date
git cherry-pick <PR501_COMMIT_SHA>
git cherry-pick <PR502_COMMIT_SHA>
git cherry-pick <PR503_COMMIT_SHA>
git cherry-pick <PR504_COMMIT_SHA>
# ... etc ...
git diff origin/canary
yarn publish-stable
```

After running this publish step, GitHub Actions will take care of publishing the modified Builder packages to npm.

If for some reason GitHub Actions fails to publish the npm package, you may do so
manually by running `npm publish` from the package directory. Make sure to
use `npm publish --tag canary` if you are publishing a canary release!

### Contributing

See the [Contribution guidelines for this project](CONTRIBUTING.md), it also contains guidance on interpreting tests failures.
