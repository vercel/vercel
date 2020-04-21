![now](https://assets.zeit.co/image/upload/v1581518533/repositories/now-cli/v4.png)

[![CI Status](https://badgen.net/github/checks/zeit/now?label=CI)](https://github.com/zeit/now/actions?workflow=CI)
[![Join the community on GitHub Discussions](https://badgen.net/badge/join%20the%20discussion/on%20github/black?icon=github)](https://github.com/zeit/now/discussions)

## Usage

Get started by [Importing a Git Project](https://vercel.com/import) and use `git push` to deploy. Alternatively, you can [install Now CLI](https://vercel.com/download).

## Documentation

For details on how to use Vercel, check out our [documentation](https://vercel.com/docs).

## Caught a Bug?

1. [Fork](https://help.github.com/articles/fork-a-repo/) this repository to your own GitHub account and then [clone](https://help.github.com/articles/cloning-a-repository/) it to your local device
2. Install dependencies with `yarn install`
3. Compile the code: `yarn build`
4. Link the package to the global module directory: `cd ./packages/now-cli && yarn link`
5. You can now start using `now` anywhere inside the command line

As always, you should use `yarn test-unit` to run the tests and see if your changes have broken anything.

## How to Create a Release

If you have write access to this repository, you can read more about how to publish a release [here](https://github.com/zeit/now/wiki/Creating-a-Release).
