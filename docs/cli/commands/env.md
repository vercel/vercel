# vercel env

Interact with environment variables for a Vercel project.

## Synopsis

```bash
vercel env <subcommand> [options]
```

## Description

The `env` command allows you to manage environment variables for your Vercel project across different environments (production, preview, development) and Git branches.

## Subcommands

### `list` / `ls`

List all environment variables for a project.

```bash
vercel env list [environment] [git-branch]
vercel env ls [environment] [git-branch]
```

#### Arguments

| Argument      | Required | Description                                              |
| ------------- | -------- | -------------------------------------------------------- |
| `environment` | No       | Filter by environment (production, preview, development) |
| `git-branch`  | No       | Filter by Git branch                                     |

#### Options

| Option       | Type    | Description                                  |
| ------------ | ------- | -------------------------------------------- |
| `--guidance` | Boolean | Receive command suggestions after completion |

#### Examples

**List all environment variables:**

```bash
vercel env list
vercel env ls
```

**List variables for production:**

```bash
vercel env list production
```

**List variables for a specific branch:**

```bash
vercel env list preview feature-branch
```

---

### `add`

Add a new environment variable.

```bash
vercel env add <name> [environment] [git-branch]
```

#### Arguments

| Argument      | Required | Description                      |
| ------------- | -------- | -------------------------------- |
| `name`        | Yes      | Name of the environment variable |
| `environment` | No       | Target environment(s)            |
| `git-branch`  | No       | Target Git branch (preview only) |

#### Options

| Option        | Type    | Description                                   |
| ------------- | ------- | --------------------------------------------- |
| `--sensitive` | Boolean | Mark as sensitive (value hidden in dashboard) |
| `--force`     | Boolean | Overwrite existing variable with same target  |
| `--guidance`  | Boolean | Receive command suggestions after completion  |

#### Environment Targets

| Target        | Description                                              |
| ------------- | -------------------------------------------------------- |
| `production`  | Available in production deployments                      |
| `preview`     | Available in preview deployments                         |
| `development` | Available locally via `vercel dev` and `vercel env pull` |

You can specify multiple targets by running the command multiple times or using the interactive prompt.

#### Examples

**Add a variable to all environments (interactive):**

```bash
vercel env add API_TOKEN
# Prompts for value and target environments
```

**Add to a specific environment:**

```bash
vercel env add DATABASE_URL production
```

**Add to preview for a specific branch:**

```bash
vercel env add FEATURE_FLAG preview feature-branch
```

**Add a sensitive variable:**

```bash
vercel env add SECRET_KEY --sensitive
```

**Overwrite existing variable:**

```bash
vercel env add API_TOKEN --force
```

**Add from stdin:**

```bash
cat ~/.npmrc | vercel env add NPM_RC preview
echo "my-secret-value" | vercel env add API_KEY production
vercel env add API_URL production < url.txt
```

---

### `remove` / `rm`

Remove an environment variable.

```bash
vercel env remove <name> [environment] [git-branch]
vercel env rm <name> [environment] [git-branch]
```

#### Arguments

| Argument      | Required | Description                    |
| ------------- | -------- | ------------------------------ |
| `name`        | Yes      | Name of the variable to remove |
| `environment` | No       | Environment to remove from     |
| `git-branch`  | No       | Git branch to remove from      |

#### Options

| Option  | Type    | Description                  |
| ------- | ------- | ---------------------------- |
| `--yes` | Boolean | Skip the confirmation prompt |

#### Examples

**Remove from all environments:**

```bash
vercel env rm API_TOKEN
```

**Remove from specific environment:**

```bash
vercel env rm DATABASE_URL preview
```

**Remove from specific branch:**

```bash
vercel env rm FEATURE_FLAG preview feature-branch
```

**Remove without confirmation:**

```bash
vercel env rm OLD_VAR --yes
```

---

### `pull`

Pull environment variables from Vercel and write to a local file.

```bash
vercel env pull [filename]
```

#### Arguments

| Argument   | Required | Description                             |
| ---------- | -------- | --------------------------------------- |
| `filename` | No       | Output filename (default: `.env.local`) |

#### Options

| Option          | Type    | Description                                     |
| --------------- | ------- | ----------------------------------------------- |
| `--environment` | String  | Environment to pull from (default: development) |
| `--git-branch`  | String  | Git branch for preview environment variables    |
| `--yes`         | Boolean | Skip confirmation prompt                        |

#### Examples

**Pull development variables to .env.local:**

```bash
vercel env pull
```

**Pull to a custom file:**

```bash
vercel env pull .env.development.local
```

**Pull production variables:**

```bash
vercel env pull --environment production .env.production.local
```

**Pull preview variables for a specific branch:**

```bash
vercel env pull --environment preview --git-branch feature-x .env.preview
```

---

### `run`

Run a command with environment variables from the linked Vercel project.

```bash
vercel env run <command...>
```

#### Arguments

| Argument  | Required | Description                     |
| --------- | -------- | ------------------------------- |
| `command` | Yes      | Command to run (with arguments) |

#### Options

| Option          | Shorthand | Type   | Description                                     |
| --------------- | --------- | ------ | ----------------------------------------------- |
| `--environment` | `-e`      | String | Environment to pull from (default: development) |
| `--git-branch`  |           | String | Git branch for preview environment variables    |

#### Examples

**Run Next.js dev with development variables:**

```bash
vercel env run -- next dev
```

**Run tests with preview variables:**

```bash
vercel env run -e preview -- npm test
```

**Run with preview variables for a specific branch:**

```bash
vercel env run -e preview --git-branch feature-x -- npm test
```

**Run arbitrary commands:**

```bash
vercel env run -- node scripts/seed.js
vercel env run -- printenv | grep DATABASE
```

---

### `update`

Update the value of an existing environment variable.

```bash
vercel env update <name> [environment] [git-branch]
```

#### Arguments

| Argument      | Required | Description                         |
| ------------- | -------- | ----------------------------------- |
| `name`        | Yes      | Name of the variable to update      |
| `environment` | No       | Environment to update               |
| `git-branch`  | No       | Git branch to update (preview only) |

#### Options

| Option        | Type    | Description                    |
| ------------- | ------- | ------------------------------ |
| `--sensitive` | Boolean | Update to a sensitive variable |
| `--yes`       | Boolean | Skip confirmation prompt       |

#### Examples

**Update a variable (interactive):**

```bash
vercel env update API_TOKEN
```

**Update for specific environment:**

```bash
vercel env update DATABASE_URL production
```

**Update from stdin:**

```bash
echo "new-value" | vercel env update API_KEY production
cat new-token.txt | vercel env update AUTH_TOKEN preview
```

---

## Environment Variable Types

### Standard Variables

Regular environment variables accessible in your application:

```bash
vercel env add NEXT_PUBLIC_API_URL
```

### Sensitive Variables

Values are hidden in the Vercel Dashboard and logs:

```bash
vercel env add DATABASE_PASSWORD --sensitive
```

### System Variables

Vercel provides automatic system variables:

| Variable                    | Description                               |
| --------------------------- | ----------------------------------------- |
| `VERCEL`                    | Always `1` when running on Vercel         |
| `VERCEL_ENV`                | `production`, `preview`, or `development` |
| `VERCEL_URL`                | Deployment URL (without protocol)         |
| `VERCEL_BRANCH_URL`         | Branch-specific URL                       |
| `VERCEL_REGION`             | Region where function is executing        |
| `VERCEL_GIT_COMMIT_SHA`     | Git commit SHA                            |
| `VERCEL_GIT_COMMIT_MESSAGE` | Git commit message                        |

---

## Workflow Examples

### Local Development

```bash
# Pull variables for local development
vercel env pull

# Run your app with those variables
npm run dev
# Or use vercel env run
vercel env run -- npm run dev
```

### CI/CD Pipeline

```yaml
# GitHub Actions example
- name: Pull Environment Variables
  run: vercel env pull .env.local --yes
  env:
    VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}

- name: Run Tests
  run: npm test
```

### Branch-Specific Configuration

```bash
# Add a feature flag for a branch
vercel env add ENABLE_NEW_FEATURE preview feature-new-ui

# Test with that branch's variables
vercel env run -e preview --git-branch feature-new-ui -- npm test
```

---

## See Also

- [pull](pull.md) - Pull all project settings
- [link](link.md) - Link to a project
- [dev](dev.md) - Local development
