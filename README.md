<p align="center">
  <a href="https://vercel.com">
    <img src="https://assets.vercel.com/image/upload/v1588805858/repositories/vercel/logo.png" height="96">
    <h3 align="center">Vercel</h3>
  </a>
</p>

<p align="center">
  Develop. Preview. Ship.
</p>

<p align="center">
  <a href="https://vercel.com/docs"><strong>Documentation</strong></a> ·
  <a href="https://vercel.com/changelog"><strong>Changelog</strong></a> ·
  <a href="https://vercel.com/templates"><strong>Templates</strong></a> ·
  <a href="https://vercel.com/docs/cli"><strong>CLI</strong></a>
</p>
<br/>

## Vercel

Vercel’s Frontend Cloud provides the developer experience and infrastructure to build, scale, and secure a faster, more personalized Web.

## Deploy

Get started by [importing a project](https://vercel.com/new) or using the [Vercel CLI](https://vercel.com/docs/cli). Then, `git push` to deploy.

## Documentation

For details on how to use Vercel, check out our [documentation](https://vercel.com/docs).

## Contributing

This project uses [pnpm](https://pnpm.io/) to install dependencies and run scripts.

You can use the `dev` script to run local changes as if you were invoking Vercel CLI. For example, `vercel deploy --cwd=/path/to/project` could be run with local changes with `pnpm dev deploy --cwd=/path/to/project`.

When contributing to this repository, please first discuss the change you wish to make via [GitHub Discussions](https://github.com/vercel/vercel/discussions/new) with the owners of this repository before submitting a Pull Request.

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) and follow it in all your interactions with the project.

### Local development

This project is configured in a monorepo, where one repository contains multiple npm packages. Dependencies are installed and managed with `pnpm`, not `npm` CLI.

To get started, execute the following:

```
git clone https://github.com/vercel/vercel
cd vercel
corepack enable
pnpm install
pnpm build
pnpm lint
pnpm test-unit
```

Make sure all the tests pass before making changes.

#### Running Vercel CLI Changes

You can use `pnpm dev` from the `cli` package to invoke Vercel CLI with local changes:

```
cd ./packages/cli
pnpm dev <cli-commands...>
```

See [CLI Local Development](../packages/cli#local-development) for more details.

### Verifying your change

Once you are done with your changes (we even suggest doing it along the way), make sure all the tests still pass by running:

```
pnpm test-unit
```

from the root of the project.

If any test fails, make sure to fix it along with your changes. See [Interpreting test errors](#Interpreting-test-errors) for more information about how the tests are executed, especially the integration tests.

### Pull Request Process

Once you are confident that your changes work properly, open a pull request on the main repository.

The pull request will be reviewed by the maintainers and the tests will be checked by our continuous integration platform.

### Interpreting test errors

There are 2 kinds of tests in this repository – Unit tests and Integration tests.

Unit tests are run locally with `jest` and execute quickly because they are testing the smallest units of code.

#### Integration tests

Integration tests create deployments to your Vercel account using the `test` project name. After each test is deployed, the `probes` key is used to check if the response is the expected value. If the value doesn't match, you'll see a message explaining the difference. If the deployment failed to build, you'll see a more generic message like the following:

```
[Error: Fetched page https://test-8ashcdlew.vercel.app/root.js does not contain hello Root!. Instead it contains An error occurred with this application.

    NO_STATUS_CODE_FRO Response headers:
       cache-control=s-maxage=0
      connection=close
      content-type=text/plain; charset=utf-8
      date=Wed, 19 Jun 2019 18:01:37 GMT
      server=now
      strict-transport-security=max-age=63072000
      transfer-encoding=chunked
      x-now-id=iad1:hgtzj-1560967297876-44ae12559f95
      x-now-trace=iad1]
```

In such cases, you can visit the URL of the failed deployment and append `/_logs` to see the build error. In the case above, that would be https://test-8ashcdlew.vercel.app/_logs

The logs of this deployment will contain the actual error which may help you to understand what went wrong.

##### Running integration tests locally

While running the full integration suite locally is not recommended, it's sometimes useful to isolate a failing test by running it on your machine. To do so, you'll need to ensure you have the appropriate credentials sourced in your shell:

1. Create an access token. Follow the insructions here https://vercel.com/docs/rest-api#creating-an-access-token. Ensure the token scope is for your personal
   account.
2. Grab the team ID from the Vercel dashboard at `https://vercel.com/<MY-TEAM>/~/settings`.
3. Source these into your shell rc file: `echo 'export VERCEL_TOKEN=<MY-TOKEN> VERCEL_TEAM_ID=<MY-TEAM-ID>' >> ~/.zshrc`

From there, you should be able to trigger an integration test. Choose one
that's already isolated to check that things work:

```
cd packages/next
```

Run the test:

```
pnpm test test/fixtures/00-server-build/index.test.js
```

#### @vercel/nft

Some of the Builders use `@vercel/nft` to tree-shake files before deployment. If you suspect an error with this tree-shaking mechanism, you can create the following script in your project:

```js
const { nodeFileTrace } = require('@vercel/nft');
nodeFileTrace(['path/to/entrypoint.js'], {
  ts: true,
  mixedModules: true,
})
  .then(o => console.log(o.fileList))
  .then(e => console.error(e));
```

When you run this script, you'll see all the imported files. If anything file is missing, the bug is in [@vercel/nft](https://github.com/vercel/nft) and not the Builder.

### Deploy a Builder with existing project

Sometimes you want to test changes to a Builder against an existing project, maybe with `vercel dev` or actual deployment. You can avoid publishing every Builder change to npm by uploading the Builder as a tarball.

1. Change directory to the desired Builder `cd ./packages/node`
2. Run `pnpm build` to compile typescript and other build steps
3. Run `npm pack` to create a tarball file
4. Run `vercel *.tgz` to upload the tarball file and get a URL
5. Edit any existing `vercel.json` project and replace `use` with the URL
6. Run `vercel` or `vercel dev` to deploy with the experimental Builder

## Reference

- [Code of Conduct](./.github/CODE_OF_CONDUCT.md)
- [Contributing Guidelines](./.github/CONTRIBUTING.md)
- [Apache 2.0 License](./LICENSE)
