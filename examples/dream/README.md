# Dream Starter

Deploy your [Dream](https://aantron.github.io/dream/) project to Vercel with zero configuration.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?demo-description=Deploy%20OCaml%20Dream%20applications%20with%20zero%20configuration.&demo-title=Dream%20Boilerplate&demo-url=https%3A%2F%2Fvercel-plus-dream.vercel.app%2F&from=templates&project-name=Dream%20Boilerplate&repository-name=dream-ocaml-boilerplate&repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fvercel%2Ftree%2Fmain%2Fexamples%2Fdream&skippable-integrations=1)

_Live Example: https://vercel-plus-dream.vercel.app/_

Visit the [Dream documentation](https://aantron.github.io/dream/) to learn more.

## Getting Started

Make sure you have OCaml and opam installed. If not, install them from [ocaml.org](https://ocaml.org/docs/installing-ocaml).

Install dependencies:

```bash
opam install --deps-only .
```

Build the project:

```bash
dune build
```

## Running Locally

Start the development server on http://localhost:3000

```bash
dune exec -- ./bin/main.exe
```

When you make changes to your project, rebuild and restart the server to see your changes.

## Deploying to Vercel

Deploy your project to Vercel with the following command:

```bash
npm install -g vercel
vercel --prod
```

Or `git push` to your repository with our [git integration](https://vercel.com/docs/deployments/git).

To view the source code for this template, [visit the example repository](https://github.com/vercel/vercel/tree/main/examples/dream).
