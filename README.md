<p align="center">
  <a href="https://vercel.com">
    <img src="https://assets.vercel.com/image/upload/v1588805858/repositories/vercel/logo.png" height="96">
    <h3 align="center">Vercel</h3>
  </a>
  <p align="center">Develop. Preview. Ship.</p>
</p>

[![CI Status](https://github.com/vercel/vercel/actions/workflows/test-unit.yml/badge.svg)](https://github.com/vercel/vercel/actions/workflows/test-unit.yml)
[![Join the community on GitHub Discussions](https://badgen.net/badge/join%20the%20discussion/on%20github/black?icon=github)](https://github.com/vercel/vercel/discussions)

## Usage

Vercel is the optimal workflow for frontend teams. All-in-one: Static and Jamstack deployment, Serverless Functions, and Global CDN.

Get started by [Importing a Git Project](https://vercel.com/import) and use `git push` to deploy. Alternatively, you can [install Vercel CLI](https://vercel.com/download).

## Documentation

For details on how to use Vercel, check out our [documentation](https://vercel.com/docs).

## Caught a Bug?

1. [Fork](https://help.github.com/articles/fork-a-repo/) this repository to your own GitHub account and then [clone](https://help.github.com/articles/cloning-a-repository/) it to your local device
2. Install dependencies with `yarn install`
3. Compile the code: `yarn build`
4. Link the package to the global module directory: `cd ./packages/cli && yarn link`
5. You can start using `vercel` anywhere inside the command line

As always, you should use `yarn test-unit` to run the tests and see if your changes have broken anything.

## How to Create a Release

If you have write access to this repository, you can read more about how to publish a release [here](https://github.com/vercel/vercel/wiki/Creating-a-Release).
