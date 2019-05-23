![now](https://assets.zeit.co/image/upload/v1542240976/repositories/now-cli/now-cli-repo-banner-v2.png)

[![Build Status](https://circleci.com/gh/zeit/now-cli.svg?&style=shield)](https://circleci.com/gh/zeit/workflows/now-cli)
[![Join the community on Spectrum](https://withspectrum.github.io/badge/badge.svg)](https://spectrum.chat/zeit)

**Note**: The [canary](https://github.com/zeit/now-cli/tree/canary) branch is under heavy development – the stable release branch is [master](https://github.com/zeit/now-cli/tree/master).

## Usage

To install the latest version of Now CLI, visit [zeit.co/download](https://zeit.co/download) or run this command:

```
npm install -g now
```

To quickly start a new project, run the following commands:

```
now init        # Pick an example project to clone
cd <PROJECT>    # Change directory to the newly created project
now dev         # Run locally during development
now             # Deploy to the cloud
```

## Documentation

For details on how to use Now CLI, check out our [documentation](https://zeit.co/docs).

## Caught a Bug?

1. [Fork](https://help.github.com/articles/fork-a-repo/) this repository to your own GitHub account and then [clone](https://help.github.com/articles/cloning-a-repository/) it to your local device
2. Install dependencies with `yarn install`
3. Link the package to the global module directory: `yarn run link` (not `yarn link`)
4. You can now start using `now` anywhere inside the command line

As always, you should use `yarn test` to run the tests and see if your changes have broken anything.

## How to Create a Release

If you have write access to this repository, you can read more about how to publish a release [here](https://github.com/zeit/now-cli/wiki/Creating-a-Release).
