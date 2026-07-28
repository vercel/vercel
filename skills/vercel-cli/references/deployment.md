# Deployment

> Exact syntax: `vercel deploy --help`, `vercel redeploy --help`, `vercel promote --help`, `vercel rollback --help`, `vercel list --help`, `vercel remove --help`, `vercel inspect --help`, `vercel build --help`

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

## Forced Deploys And Build Cache

`vercel deploy --force` creates a new deployment even when Vercel would otherwise
reuse an existing result. For forced deploys, build cache is not retained unless
`--with-cache` is also provided.

Use this when you need a fresh preview build from the current local checkout:

```bash
vercel deploy . --target preview --force
```

A manual CLI deploy is not the same as a Git integration
redeploy: it creates a new deployment from local source, so commit metadata,
aliases, source provenance, and dashboard grouping may differ from the original
Git-triggered deployment.

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

See `vercel rolling-release --help` for approve, abort, and complete commands.
