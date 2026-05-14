# Environment Variables

## Scoping

Env vars are scoped to **environments**: production, preview (can be branch-specific), and development.

Variables can be plain text or sensitive (encrypted, not readable after creation).

## Inspecting Env Vars

`vercel env ls` shows configured variable names, targets, and metadata. Plain values may appear in JSON output; sensitive values are not readable after creation.

For metadata-oriented investigations, start with:

```bash
# Run from a linked project directory
vercel env ls --format json
vercel env ls production --format json
```

If CLI output does not include required metadata, use `vercel api` after checking available endpoints with `vercel api list`. Do not invent unsupported `env ls` scope/project flags; link or switch scope first when the command requires project context.

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
