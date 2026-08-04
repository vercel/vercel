# vercel deploy

Deploy your project to Vercel.

## Synopsis

```bash
vercel deploy [project-path] [options]
vercel [project-path] [options]
```

## Description

The `deploy` command uploads your project to Vercel and creates a new deployment. It is the default command, so `vercel` and `vercel deploy` are equivalent.

## Arguments

| Argument       | Required | Description                                  |
| -------------- | -------- | -------------------------------------------- |
| `project-path` | No       | Path to the project directory (default: `.`) |

## Options

| Option          | Shorthand | Type     | Description                                     |
| --------------- | --------- | -------- | ----------------------------------------------- |
| `--force`       | `-f`      | Boolean  | Force new deployment even if nothing changed    |
| `--with-cache`  |           | Boolean  | Retain build cache when using `--force`         |
| `--public`      | `-p`      | Boolean  | Make deployment source public (`/_src` exposed) |
| `--env`         | `-e`      | String[] | Runtime environment variables (`KEY=value`)     |
| `--build-env`   | `-b`      | String[] | Build-time environment variables (`KEY=value`)  |
| `--meta`        | `-m`      | String[] | Metadata for the deployment (`KEY=value`)       |
| `--regions`     |           | String   | Default regions for the deployment              |
| `--prebuilt`    |           | Boolean  | Deploy existing build from `vercel build`       |
| `--prod`        |           | Boolean  | Create production deployment                    |
| `--target`      |           | String   | Target deployment environment                   |
| `--archive`     |           | String   | Compress code before upload (`tgz`)             |
| `--no-wait`     |           | Boolean  | Don't wait for deployment to finish             |
| `--skip-domain` |           | Boolean  | Skip automatic domain aliasing                  |
| `--yes`         | `-y`      | Boolean  | Use default options, skip prompts               |
| `--logs`        | `-l`      | Boolean  | Print build logs                                |
| `--guidance`    |           | Boolean  | Show command suggestions after deployment       |

## Examples

### Basic Deployment

```bash
# Deploy current directory
vercel

# Deploy specific directory
vercel /path/to/project
```

### Production Deployment

```bash
# Deploy to production
vercel --prod

# Equivalent using target
vercel --target production
```

### Force Deployment

```bash
# Force new deployment
vercel --force

# Force but keep build cache
vercel --force --with-cache
```

### Environment Variables

```bash
# Set runtime environment variables
vercel -e API_KEY=secret -e NODE_ENV=production

# Set build-time environment variables
vercel -b NEXT_PUBLIC_API=https://api.example.com
```

### Metadata

```bash
# Add metadata for filtering/tracking
vercel -m branch=main -m pr=123 -m author=john
```

### Prebuilt Deployment

```bash
# Build locally first
vercel build

# Deploy the prebuilt output
vercel deploy --prebuilt
```

### Custom Target

```bash
# Deploy to staging environment
vercel --target staging

# Deploy to custom target
vercel --target qa
```

### Skip Domain Assignment

```bash
# Deploy without assigning to production domains
vercel --prod --skip-domain

# Later, use promote to assign domains
vercel promote <deployment-url>
```

### Non-Interactive

```bash
# CI/CD friendly - no prompts
vercel --yes

# Save deployment URL to file
vercel --yes > deployment-url.txt
```

### With Build Logs

```bash
# Stream build logs during deployment
vercel --logs
```

### Archive Upload

```bash
# Compress project before upload (faster for large projects)
vercel --archive tgz
```

---

## Deployment Types

### Preview Deployments

Created by default or from non-production branches:

```bash
vercel  # Creates preview deployment
```

- Unique URL for each deployment
- Accessible via `project-name-<hash>.vercel.app`
- Not assigned to production domains

### Production Deployments

Created with `--prod` or from the production branch:

```bash
vercel --prod
```

- Assigned to production domains
- Visible to end users
- Can use rolling releases

---

## Output

The command outputs the deployment URL:

```
Vercel CLI 33.0.0
🔍  Inspect: https://vercel.com/team/project/abc123
✅  Production: https://my-project.vercel.app [copied to clipboard]
```

### Capture URL in Scripts

```bash
# Save to variable
DEPLOY_URL=$(vercel --yes)

# Save to file
vercel --yes > url.txt
```

---

## CI/CD Integration

### GitHub Actions

```yaml
- name: Deploy to Vercel
  id: deploy
  run: |
    DEPLOY_URL=$(vercel deploy --yes --token ${{ secrets.VERCEL_TOKEN }})
    echo "url=$DEPLOY_URL" >> $GITHUB_OUTPUT

- name: Run E2E Tests
  run: npm run test:e2e -- --url ${{ steps.deploy.outputs.url }}
```

### Production Deploy on Main

```yaml
- name: Deploy Production
  if: github.ref == 'refs/heads/main'
  run: vercel deploy --prod --yes --token ${{ secrets.VERCEL_TOKEN }}
```

### Preview Deploy on PR

```yaml
- name: Deploy Preview
  run: |
    URL=$(vercel deploy --yes --token ${{ secrets.VERCEL_TOKEN }})
    echo "Preview: $URL"
```

---

## Build Cache

Vercel caches build outputs to speed up subsequent deployments:

```bash
# Normal deploy (uses cache)
vercel

# Force rebuild but keep cache for next time
vercel --force --with-cache

# Force rebuild and invalidate cache
vercel --force
```

---

## Regions

Specify regions for function deployment:

```bash
vercel --regions iad1,sfo1,cdg1
```

Common regions:

| Code   | Location         |
| ------ | ---------------- |
| `iad1` | Washington, D.C. |
| `sfo1` | San Francisco    |
| `cdg1` | Paris            |
| `hnd1` | Tokyo            |
| `syd1` | Sydney           |

---

## See Also

- [build](build.md) - Build locally
- [dev](dev.md) - Local development
- [inspect](inspect.md) - View deployment details
- [promote](promote.md) - Promote deployments
- [rollback](rollback.md) - Rollback deployments
