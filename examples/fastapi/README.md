# FastAPI Starter

Deploy your [FastAPI](https://fastapi.tiangolo.com/) project to Vercel with zero configuration.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/vercel/tree/main/examples/fastapi&template=fastapi)

_Live Example: https://vercel-plus-fastapi.vercel.app/_

Visit the [FastAPI documentation](https://fastapi.tiangolo.com/) to learn more.

## Project Structure

This example follows the [larger applications](https://fastapi.tiangolo.com/tutorial/bigger-applications/) pattern from the FastAPI docs:

```
app/
├── __init__.py
├── main.py              # FastAPI application entry point
├── api/
│   ├── __init__.py
│   ├── main.py          # API router assembly
│   ├── deps.py          # Shared dependencies
│   └── routes/
│       ├── __init__.py
│       └── items.py     # Item endpoints
└── core/
    ├── __init__.py
    └── config.py        # Application settings
```

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
python -m app.main
# using uv:
uv run -m app.main
```

When you make changes to your project, the server will automatically reload.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Landing page |
| `GET` | `/api/v1/items/` | List sample items |
| `GET` | `/api/v1/items/{item_id}` | Get item by ID |
| `GET` | `/docs` | Interactive API docs (Swagger UI) |

## Deploying to Vercel

Deploy your project to Vercel with the following command:

```bash
npm install -g vercel
vercel --prod
```

Or `git push` to your repository with our [git integration](https://vercel.com/docs/deployments/git).

To view the source code for this template, [visit the example repository](https://github.com/vercel/vercel/tree/main/examples/fastapi).
