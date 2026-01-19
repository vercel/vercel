# Django Starter

Deploy your [Django](https://www.djangoproject.com/) project to Vercel with zero configuration.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/vercel/tree/main/examples/django&template=django)

_Live Example: https://vercel-plus-django.vercel.app/_

Visit the [Django documentation](https://www.djangoproject.com/) to learn more.

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
python manage.py runserver 0.0.0.0:5001
# using uv:
uv run manage.py runserver 0.0.0.0:5001
```

When you make changes to your project, the server will automatically reload.

## Deploying to Vercel

Deploy your project to Vercel with the following command:

```bash
npm install -g vercel
vercel --prod
```

Or `git push` to your repository with our [git integration](https://vercel.com/docs/deployments/git).

To view the source code for this template, visit the example directory in the
main Vercel repository.


