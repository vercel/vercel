# Environment Variables

## Scoping

Env vars are scoped to **environments**: production, preview (can be branch-specific), and development.

Variables can be plain text or sensitive (encrypted, not readable after creation).

## Managing Env Vars

```bash
vercel env add API_KEY production              # add to production
vercel env ls                                  # list all
vercel env update API_KEY production           # update value
vercel env rm API_KEY preview                  # remove from preview
echo "secret" | vercel env add TOKEN production  # pipe value from stdin
```

Note: `environment` is a **positional argument**, not a flag.

## Pulling Locally

```bash
vercel env pull                   # writes to .env.local
vercel env pull .env.development  # writes to custom file
```

`vercel pull` also downloads env vars along with project config.

## Running with Env Vars

Inject env vars into a subprocess without writing to a file:

```bash
vercel env run -- npm test
vercel env run -e preview -- next dev
```

The `--` separator is required before the command.
