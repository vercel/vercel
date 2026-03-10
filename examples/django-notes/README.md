# Django Notes

A simple note-taking app built with [Django](https://www.djangoproject.com/) that can be deployed to Vercel.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/vercel/tree/main/examples/django-notes&template=django-notes)

## Features

Demonstrates core [Django](https://docs.djangoproject.com/) features:

- **Models & migrations** — define a `Note` model and manage the schema with `makemigrations` and `migrate`
- **ModelForm** — generate and validate a form directly from the model
- **Function-based views** — handle GET and POST using `render`, `redirect`, and `get_object_or_404`
- **Templates** — share a common layout with `{% extends %}` and link pages with `{% url %}`

## Getting Started

Install the required dependencies:

```bash
uv sync
```

Run the database migrations:

```bash
uv run manage.py migrate
```

## Running Locally

Start the development server on http://127.0.0.1:8000

```bash
uv run manage.py runserver
```

When you make changes to your project, the server will automatically reload.

## Deploying to Vercel

This app uses SQLite locally, but Vercel's serverless environment does not have a persistent filesystem. You'll need to provision a Postgres database before deploying.

**1. Install the Vercel CLI and link your project**

```bash
npm install -g vercel
vercel link
```

**2. Add a Postgres database**

From the [Vercel dashboard](https://vercel.com/dashboard), go to your project's **Storage** tab and create a Postgres database. Vercel will automatically add `DATABASE_URL` to your project's environment variables.

**3. Pull environment variables and run migrations**

```bash
vercel env pull .env.local
uv run manage.py migrate
```

**4. Deploy**

```bash
vercel --prod
```

Or `git push` to your repository with the [Vercel git integration](https://vercel.com/docs/deployments/git).

## Project Structure

```
django-notes/
├── app/                  # Django project config (settings, urls, wsgi)
└── notes/                # Notes app
    ├── models.py         # Note model (title, body, timestamps)
    ├── forms.py          # NoteForm (ModelForm)
    ├── views.py          # list, create, detail, edit, delete views
    ├── urls.py           # URL patterns
    ├── migrations/       # Database migrations
    └── templates/notes/  # HTML templates
```

