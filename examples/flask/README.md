# Flask Starter

Deploy your [Flask](https://flask.palletsprojects.com/) project to Vercel with zero configuration.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?demo-description=Deploy%20Python%20Flask%20applications%20with%20zero%20configuration.&demo-image=%2F%2Fimages.ctfassets.net%2Fe5382hct74si%2F54Zhp672eFRUqepOakJ0qU%2F8894990170d1edb4a0287a0b7ce79dff%2FFlask_Light.png&demo-title=Flask%20Boilerplate&demo-url=https%3A%2F%2Fvercel-plus-flask.vercel.app%2F&from=templates&project-name=Flask%20Boilerplate&project-names=Comma%20separated%20list%20of%20project%20names%2Cto%20match%20the%20root-directories&repository-name=flask-python-boilerplate&repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fexamples%2Ftree%2Fmain%2Fpython%2Fflask&root-directories=List%20of%20directory%20paths%20for%20the%20directories%20to%20clone%20into%20projects&skippable-integrations=1&teamSlug=zero-conf-vtest314)

_Live Example: https://vercel-plus-flask.vercel.app/_

Visit the [Flask documentation](https://flask.palletsprojects.com/) to learn more.

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

To view the source code for this template, [visit the example repository](https://github.com/vercel/vercel/tree/main/examples/flask).
