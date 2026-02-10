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

## Accessing Preview Deployments

Use `vercel curl` — it handles deployment protection automatically:

```bash
vercel curl /api/health --deployment $PREVIEW_URL
```

**Do not disable deployment protection.** Use `vercel curl` instead.

## Other Deploy Commands

- `vercel redeploy <url>` — rebuild an existing deployment
- `vercel promote <url>` — move a deployment to production without rebuilding
- `vercel rollback <url>` — revert to a previous deployment
- `vercel rolling-release` — gradual traffic shifting

## Workflows

### Blue/Green

```bash
URL=$(vercel --prod --skip-domain)   # deploy without domain assignment
vercel curl / --deployment $URL      # verify (handles deployment protection)
vercel promote $URL                  # promote to production
```

### Rolling Release

```bash
vercel rr configure --enable --stage=10,5m --stage=50,10m --stage=100,0
vercel rr start --dpl=<deployment-url>
vercel rr status
```
