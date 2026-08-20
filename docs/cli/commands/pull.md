# vercel pull

Pull environment variables and project settings from Vercel.

## Synopsis

```bash
vercel pull [project-path] [options]
```

## Description

The `pull` command downloads your project's configuration and environment variables from Vercel, storing them locally for development and build processes.

## Arguments

| Argument       | Required | Description                              |
| -------------- | -------- | ---------------------------------------- |
| `project-path` | No       | Path to project directory (default: `.`) |

## Options

| Option          | Type    | Description                                     |
| --------------- | ------- | ----------------------------------------------- |
| `--environment` | String  | Environment to pull from (default: development) |
| `--git-branch`  | String  | Git branch for preview environment variables    |
| `--prod`        | Boolean | Pull production environment (shorthand)         |
| `--yes`         | Boolean | Skip prompts                                    |

## Examples

### Pull Development Settings

```bash
vercel pull
```

Creates/updates:

- `.vercel/project.json` - Project configuration
- `.env.local` - Environment variables

### Pull Production Settings

```bash
vercel pull --prod
# Or
vercel pull --environment production
```

### Pull for Specific Environment

```bash
vercel pull --environment preview
vercel pull --environment staging
```

### Pull for Specific Branch

```bash
vercel pull --environment preview --git-branch feature-x
```

### Pull to Different Directory

```bash
vercel pull ./my-project
```

### CI/CD Usage

```bash
vercel pull --yes
```

---

## What Gets Pulled

### Project Settings

- Framework configuration
- Build settings
- Output directory
- Install command
- Node.js version

Stored in `.vercel/project.json`:

```json
{
  "projectId": "prj_abc123",
  "orgId": "team_xyz789",
  "settings": {
    "framework": "nextjs",
    "buildCommand": "next build",
    "outputDirectory": ".next"
  }
}
```

### Environment Variables

Downloaded to `.env.local`:

```bash
DATABASE_URL="postgresql://..."
API_KEY="secret-key"
NEXT_PUBLIC_API_URL="https://api.example.com"
```

---

## Environment Targets

| Target      | Flag                       | Use Case               |
| ----------- | -------------------------- | ---------------------- |
| Development | (default)                  | Local development      |
| Preview     | `--environment preview`    | Testing preview builds |
| Production  | `--environment production` | Production debugging   |
| Custom      | `--environment <name>`     | Custom targets         |

---

## Workflow

### Local Development

```bash
# Pull latest settings
vercel pull

# Start development
vercel dev
# or
npm run dev
```

### CI/CD Build

```bash
# Pull production config
vercel pull --environment production --yes

# Build
vercel build --prod

# Deploy
vercel deploy --prebuilt --prod
```

### Branch-Specific Testing

```bash
# Pull preview env for feature branch
vercel pull --environment preview --git-branch feature-x

# Run tests with those variables
npm test
```

---

## Comparison with env pull

| Command           | Downloads                  | File             |
| ----------------- | -------------------------- | ---------------- |
| `vercel pull`     | Settings + env vars        | Multiple files   |
| `vercel env pull` | Only environment variables | Single .env file |

```bash
# Full project sync
vercel pull

# Just environment variables
vercel env pull .env.local
```

---

## See Also

- [env](env.md) - Manage environment variables
- [link](link.md) - Link to a project
- [build](build.md) - Build locally
