# FastHTML Boilerplate

Deploy your [FastHTML](https://fastht.ml/) project to Vercel with zero configuration.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/vercel/tree/main/examples/fasthtml&template=fasthtml)

_Live Example: https://fasthtml-template.vercel.app_

Visit the [FastHTML documentation](https://docs.fastht.ml/) to learn more.

## Getting Started

Install [`uv`](https://github.com/astral-sh/uv) as a drop-in replacement for `pip`:

```bash
pip install uv
```

Create a virtual environment:

```bash
uv venv
```

Install the required dependencies:

```bash
uv pip install -r requirements.txt
```

## Running Locally

Start the development server on http://0.0.0.0:5001

```bash
python main.py
```

When you make changes to your project, the server will automatically reload.
