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
