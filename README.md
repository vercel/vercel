# now-builders

This is a monorepo containing the [Official Builders](https://zeit.co/docs/v2/advanced/builders) provided by the ZEIT team.

## Channels

There are two Channels:

| Channel | Git Branch                                                    | npm dist-tag | use example        |
| ------- | ------------------------------------------------------------- | ------------ | ------------------ |
| Canary  | [canary](https://github.com/zeit/now-builders/commits/canary) | `@canary`    | `@now/node@canary` |
| Stable  | [master](https://github.com/zeit/now-builders/commits/master) | `@latest`    | `@now/node@latest` |

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
# View differences excluding "Publish" commits
git checkout canary && git pull
git log --pretty=format:"$ad- %s [%an]" | grep -v Publish > ~/Desktop/canary.txt
git checkout master && git pull
git log --pretty=format:"$ad- %s [%an]" | grep -v Publish > ~/Desktop/master.txt
diff ~/Desktop/canary.txt ~/Desktop/master.txt

# Cherry pick all PRs from canary into master ...
git cherry-pick <PR501_COMMIT_SHA>
git cherry-pick <PR502_COMMIT_SHA>
git cherry-pick <PR503_COMMIT_SHA>
git cherry-pick <PR504_COMMIT_SHA>

# Verify the only difference is "version" in package.json
git diff origin/canary

# Ship it
yarn publish-stable
```

After running this publish step, GitHub Actions will take care of publishing the modified Builder packages to npm.

If for some reason GitHub Actions fails to publish the npm package, you may do so
manually by running `npm publish` from the package directory. Make sure to
use `npm publish --tag canary` if you are publishing a canary release!

### Contributing

See the [Contribution guidelines for this project](CONTRIBUTING.md), it also contains guidance on interpreting tests failures.

### Creating Your Own Builder

To create your own Builder, see [the Builder's Developer Reference](DEVELOPING_A_BUILDER.md).
