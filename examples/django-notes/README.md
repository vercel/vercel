# Django Notes

A simple note taking app that can be deployed to Vercel.

This example demonstrates a full-stack [Django](https://docs.djangoproject.com/) project, using Django's built-in ORM, forms, and template engine to handle both the backend data layer and frontend rendering in a single framework.

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

Note: this example's `manage.py` will load `.env.local` if it exists.

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

