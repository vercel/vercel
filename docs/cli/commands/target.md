# vercel target

Manage your Vercel project's targets (custom environments).

## Synopsis

```bash
vercel target <subcommand> [options]
vercel targets <subcommand> [options]
```

## Description

Targets are custom deployment environments beyond the standard production, preview, and development environments. They allow you to create dedicated environments for staging, QA, testing, or any other workflow requirements.

## Aliases

- `targets`

## Subcommands

### `list` / `ls`

List all targets defined for the current project.

```bash
vercel target list
vercel target ls
vercel targets ls
```

#### Examples

**List all targets:**

```bash
vercel target ls
```

**Sample Output:**

```
Targets for my-project

  Name        ID               Created
  staging     tgt_abc123...    2024-01-15
  qa          tgt_def456...    2024-01-10
  testing     tgt_ghi789...    2024-01-05
```

---

## Understanding Targets

### Built-in Environments

Vercel provides three built-in environments:

| Environment   | Description                              |
| ------------- | ---------------------------------------- |
| `production`  | Live production deployments              |
| `preview`     | Deployments from non-production branches |
| `development` | Local development via `vercel dev`       |

### Custom Targets

Custom targets extend this with additional environments like:

- **staging** - Pre-production testing
- **qa** - Quality assurance
- **demo** - Customer demonstrations
- **feature-x** - Feature-specific environments

---

## Using Targets

### Deploy to a Target

```bash
vercel deploy --target staging
vercel deploy --target qa
```

### Build for a Target

```bash
vercel build --target staging
```

### Pull Environment Variables for a Target

```bash
vercel pull --environment staging
```

### Environment Variables per Target

Each target can have its own environment variables:

```bash
# In the Vercel Dashboard:
# Settings → Environment Variables → Select "staging" target

# Or via CLI with environment targeting
vercel env add DATABASE_URL staging
```

---

## Workflow Examples

### Staging Workflow

```bash
# Deploy to staging
vercel deploy --target staging

# After QA approval, promote to production
vercel promote <staging-deployment-url>
```

### Multiple QA Environments

```bash
# List available targets
vercel target ls

# Deploy feature to specific QA environment
vercel deploy --target qa-team-a

# Deploy another feature to different QA
vercel deploy --target qa-team-b
```

### CI/CD with Targets

```yaml
# GitHub Actions example
jobs:
  deploy-staging:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to Staging
        run: |
          vercel pull --environment staging --yes
          vercel build --target staging
          vercel deploy --prebuilt --target staging
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}

  deploy-production:
    needs: deploy-staging
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Production
        run: vercel deploy --prod
```

---

## Target Configuration

Targets are typically configured in the Vercel Dashboard:

1. Go to **Project Settings**
2. Navigate to **Deployment Protection** or **Environments**
3. Create new custom environment/target
4. Configure:
   - Environment variables
   - Protection settings
   - Domain assignments

---

## Best Practices

1. **Naming Convention**: Use clear, consistent names (e.g., `staging`, `qa`, `demo`)

2. **Environment Parity**: Keep target configurations as close to production as possible

3. **Access Control**: Use deployment protection for sensitive targets

4. **Documentation**: Document target purposes and access requirements for your team

5. **Cleanup**: Remove unused targets to avoid confusion

---

## See Also

- [deploy](deploy.md) - Deploy to a target
- [promote](promote.md) - Promote deployments
- [env](env.md) - Manage environment variables
- [pull](pull.md) - Pull target-specific settings
