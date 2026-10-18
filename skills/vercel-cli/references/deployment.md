# Deployment

Ensure `.vercel/` exists before deploying (via `vercel link` or `vercel link --repo`).

## Basic Usage

```bash
vercel                    # preview deployment (default)
vercel --prod             # production deployment
vercel --target staging   # custom environment
```

## Prebuilt Deploy

Build locally, deploy the output — avoids remote builds:

```bash
vercel build --prod
vercel deploy --prebuilt --prod
```

If build and deploy run in **separate CI jobs**, use `--standalone` so artifacts are self-contained:

```bash
vercel build --prod --standalone
# (upload .vercel/output/ as artifact, then in deploy job:)
vercel deploy --prebuilt --prod
```

## Deploy Output

- **stdout**: The deployment URL (pipeable)
- **stderr**: Progress and errors

```bash
URL=$(vercel deploy --prod)
```

## Temporary Deployments (No Login)

Without credentials, `vercel deploy` fails and suggests `vercel deploy --temporary` or `vercel login`. Use `--temporary` to deploy without an account:

```bash
vercel deploy --temporary
vercel deploy --temporary --format json   # includes claimUrl and expiresAt
```

- Only applies when no credentials are present; when logged in, a normal deployment is created.
- Builds locally (`vercel build --prod`) and deploys the prebuilt output. No `vercel link` is needed.
- Always targets production; `--target` with any other value is rejected.
- Refused in CI and in directories already linked to a project (`.vercel/project.json`, `.vercel/repo.json`, or `VERCEL_ORG_ID` + `VERCEL_PROJECT_ID`). Use `vercel login` or `VERCEL_TOKEN` there instead.
- Stores a temporary credential in `.vercel/anonymous.json` (gitignored). Re-running `vercel deploy --temporary` in the same directory redeploys the same temporary project until it expires.
- Prints when the deployment expires and a claim URL to keep it. Give the claim URL only to the user: it transfers ownership, so do not post it publicly.
- After claiming, or once expired, run `vercel login` to keep deploying.
- Single-file temporary deployments require an `.html` file: `vercel index.html --temporary`.

## Forced Deploys And Build Cache

`vercel deploy --force` creates a new deployment even when Vercel would otherwise
reuse an existing result. For forced deploys, build cache is not retained unless
`--with-cache` is also provided.

Use this when you need a fresh preview build from the current local checkout:

```bash
vercel deploy . --target preview --force
```

For large repositories, retry with an archive if the CLI reports too many files:

```bash
vercel deploy . --target preview --force --archive=tgz
```

`vercel redeploy <url>` rebuilds an existing deployment, but it does not support
a no-cache flag. A manual CLI deploy is not the same as a Git integration
redeploy: it creates a new deployment from local source, so commit metadata,
aliases, source provenance, and dashboard grouping may differ from the original
Git-triggered deployment.

## Accessing Preview Deployments

Use `vercel curl` — it handles deployment protection automatically:

```bash
vercel curl /api/health --deployment $PREVIEW_URL
```

**Do not disable deployment protection.** Use `vercel curl` instead.

## Other Deploy Commands

- `vercel redeploy <url>` — rebuild an existing deployment; no no-cache flag
- `vercel promote <url>` — move a deployment to production without rebuilding
- `vercel rollback <url>` — revert to a previous deployment
- `vercel rolling-release` / `vercel rr` — gradual traffic shifting

## Workflows

### Blue/Green

```bash
URL=$(vercel --prod --skip-domain)   # deploy without domain assignment
vercel curl / --deployment $URL      # verify (handles deployment protection)
vercel promote $URL                  # promote to production
```

### Rolling Release

```bash
vercel rr configure --enable --advancement-type=automatic --stage=10,5m --stage=50,10m
vercel rr start --dpl=<deployment-url> --yes
vercel rr fetch
```

See `references/project-infra.md` for approve, abort, and complete commands.
