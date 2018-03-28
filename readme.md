![now](https://github.com/zeit/art/blob/a7867d60f54a41127023a8740a221921df309d24/now-cli/repo-banner.png?raw=true)

[![Build Status](https://circleci.com/gh/zeit/now-cli.svg?&style=shield)](https://circleci.com/gh/zeit/workflows/now-cli) [![Join the community on Spectrum](https://withspectrum.github.io/badge/badge.svg)](https://spectrum.chat/now)

**Note**: the `canary` branch is under heavy development. The stable release branch is `master`.

## Installation

To get the latest version, run this command:

```
npm install -g now
```

For other installation methods, check out our [Download](https://zeit.co/download) page

## Local Development

To develop locally, clone the project and install the dependencies:

```console
yarn
```

To monitor changes in the filesystem and trigger a build, execute:

```console
yarn dev
```

To test it, we recommend linking your `now` to the one in development:

```console
yarn run link
```

_Note: `npm link` and `yarn link` don't work directly. You must execute your link script via `yarn run link` explicitly so that we can perform the necessary build steps._

## Documentation

For our up-to-date complete documentation, check out our [Docs](https://zeit.co/docs) page.
