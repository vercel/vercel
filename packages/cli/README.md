<p align="center">
  <a href="https://vercel.com">
    <img src="https://assets.vercel.com/image/upload/v1588805858/repositories/vercel/logo.png" height="96">
    <h3 align="center">Vercel</h3>
  </a>
  <p align="center">Develop. Preview. Ship.</p>
</p>

[Join the Vercel Community](https://vercel.community/)

## Usage

Vercel's frontend cloud gives developers frameworks, workflows, and infrastructure to build a faster, more personalized web.

To install the latest version of Vercel CLI, run this command:

```bash
npm i -g vercel
```

To quickly start a new project, run the following commands:

```bash
vercel init     # Pick an example project
cd <PROJECT>    # Change directory to the new project
vercel          # Deploy to the cloud
```

Finally, [connect your Git repository to Vercel](https://vercel.com/docs/git) and deploy with `git push`.

## Documentation

For details on how to use Vercel CLI, check out our [documentation](https://vercel.com/docs/cli).

## Local Development

To develop Vercel CLI, first check out the source code, install dependencies, and build all packages:

```bash
git clone https://github.com/vercel/vercel.git
cd vercel
pnpm install
pnpm build
```

At this point you can make modifications to the CLI source code and test them out locally. The CLI source code is located in the `packages/cli` directory.

```bash
cd packages/cli
```

### `pnpm dev <cli-commands...>`

From within the `packages/cli` directory, you can use the "dev" script to quickly execute Vercel CLI from its TypeScript source code directly (without having to manually compile first). For example:

```bash
pnpm dev deploy
pnpm dev whoami
pnpm dev login
pnpm dev switch --debug
```

When you are satisfied with your changes, make a commit and create a pull request!
