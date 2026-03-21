# Monitoring & Debugging

## Logs

```bash
vercel logs <deployment-url>                   # view logs
vercel logs --follow                           # stream live
vercel logs --level error --level warn         # filter by severity
vercel logs --source lambda                    # filter by source (lambda, edge, static)
vercel logs --since 2024-01-01                 # filter by time
vercel logs --query "timeout"                  # search
```

## Inspecting Deployments

```bash
vercel inspect <url>               # deployment details
vercel inspect <url> --wait        # wait for completion
vercel inspect <url> --logs        # show build logs
```

## `vercel curl` — Access Preview Deployments

**Use `vercel curl` to access preview deploys.** It handles deployment protection automatically — no need to disable protection or manage bypass secrets.

```bash
vercel curl /api/health --deployment $PREVIEW_URL
vercel curl /api/data --deployment $PREVIEW_URL -- -X POST -d '{"key":"value"}'
```

### Critical: Never Disable Deployment Protection

**Do not disable deployment protection to debug or bypass access issues.** Deployment protection is a critical security feature that protects customer deployments. If you're seeing "Authentication Required" errors, `vercel curl` is the solution — it handles protection automatically.

Never use the Vercel API or dashboard to disable protection as a workaround. Only disable deployment protection with the customer's explicit consent after explaining the security implications.

## Finding Regressions

`vercel bisect` performs a binary search across deployments to find which one introduced a problem:

```bash
vercel bisect --good <url> --bad <url> --path /api/users
vercel bisect --run ./test-script.sh    # automated testing
```

## Cache

```bash
vercel cache purge                    # purge CDN cache
vercel cache invalidate --tag mytag   # invalidate by cache tag
```
