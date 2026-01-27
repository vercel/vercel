# Starlette Starter

Deploy your [Starlette](https://www.starlette.io/) project to Vercel with zero configuration.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?demo-description=Deploy%20Python%20Starlette%20applications%20with%20zero%20configuration.&demo-title=Starlette%20Boilerplate&demo-url=https%3A%2F%2Fvercel-plus-starlette.vercel.app%2F&from=templates&project-name=Starlette%20Boilerplate&repository-name=starlette-python-boilerplate&repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fexamples%2Ftree%2Fmain%2Fpython%2Fstarlette&skippable-integrations=1)

_Live Example: https://vercel-plus-starlette.vercel.app/_

Visit the [Starlette documentation](https://www.starlette.io/) to learn more.

## Getting Started

Install the required dependencies:

```bash
python -m venv .venv
source .venv/bin/activate
pip install .
```

Or, if using [uv](https://docs.astral.sh/uv/):

```bash
uv sync
```


## Running Locally

Start the development server on http://0.0.0.0:5001

```bash
python main.py
# using uv:
uv run main.py
```

When you make changes to your project, the server will automatically reload.

## Deploying to Vercel

Deploy your project to Vercel with the following command:

```bash
npm install -g vercel
vercel --prod
```

Or `git push` to your repository with our [git integration](https://vercel.com/docs/deployments/git).

To view the source code for this template, [visit the example repository](https://github.com/vercel/vercel/tree/main/examples/starlette).
