# Publishing to npm

Always publish to the Canary Channel as soon as a PR is merged into the `canary` branch.

```
yarn publish-canary
```

Publish the Stable Channel weekly.

- Cherry pick each commit from `canary` to `master` branch
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
