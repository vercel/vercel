# vercel project

Manage your Vercel projects.

## Synopsis

```bash
vercel project <subcommand> [options]
vercel projects <subcommand> [options]
```

## Description

The `project` command allows you to create, list, inspect, and remove Vercel projects.

## Aliases

- `projects`

## Subcommands

### `list` / `ls` (default)

Show all projects in the selected scope.

```bash
vercel project list [options]
vercel project ls [options]
vercel project  # list is the default
```

#### Options

| Option              | Type    | Description                                     |
| ------------------- | ------- | ----------------------------------------------- |
| `--next`            | Number  | Show next page (timestamp in ms)                |
| `--json`            | Boolean | Output in JSON format                           |
| `--update-required` | Boolean | List projects affected by upcoming deprecations |

#### Examples

**List all projects:**

```bash
vercel project ls
vercel projects
```

**Paginate results:**

```bash
vercel project ls --next 1705312200000
```

**JSON output:**

```bash
vercel project ls --json
```

**List projects needing Node.js updates:**

```bash
vercel project ls --update-required
```

**Combined for automation:**

```bash
vercel project ls --update-required --json | jq '.[] | .name'
```

---

### `add`

Create a new project.

```bash
vercel project add <name>
```

#### Arguments

| Argument | Required | Description              |
| -------- | -------- | ------------------------ |
| `name`   | Yes      | Name for the new project |

#### Examples

**Add a new project:**

```bash
vercel project add my-new-project
```

**Add and then link:**

```bash
vercel project add my-app
vercel link --project my-app
```

---

### `inspect`

Display information about a project.

```bash
vercel project inspect [name] [options]
```

#### Arguments

| Argument | Required | Description                                   |
| -------- | -------- | --------------------------------------------- |
| `name`   | No       | Project name (uses linked project if omitted) |

#### Options

| Option  | Type    | Description               |
| ------- | ------- | ------------------------- |
| `--yes` | Boolean | Skip confirmation prompts |

#### Examples

**Inspect linked project:**

```bash
vercel project inspect
```

**Inspect specific project:**

```bash
vercel project inspect my-project
```

**Sample Output:**

```
Project Details

  ID:                   prj_abc123def456
  Name:                 my-project
  Framework:            Next.js
  Node.js Version:      20.x
  Build Command:        next build
  Output Directory:     .next
  Install Command:      npm install
  Root Directory:       ./
  Created:              2024-01-01T00:00:00.000Z

Git Repository

  Provider:             GitHub
  Repo:                 myorg/my-project
  Branch:               main
  Connected:            Yes

Domains

  - my-project.vercel.app
  - my-custom-domain.com

Environment Variables

  Production:           12 variables
  Preview:              10 variables
  Development:          8 variables
```

---

### `remove` / `rm`

Delete a project.

```bash
vercel project remove <name>
vercel project rm <name>
```

#### Arguments

| Argument | Required | Description                   |
| -------- | -------- | ----------------------------- |
| `name`   | Yes      | Name of the project to delete |

#### Examples

**Remove a project:**

```bash
vercel project rm old-project
```

> ⚠️ **Warning**: This permanently deletes the project and all its deployments.

---

## Project Information

### Project Settings

When you inspect a project, you'll see:

| Setting          | Description                              |
| ---------------- | ---------------------------------------- |
| Framework        | Detected or configured framework         |
| Node.js Version  | Runtime version for serverless functions |
| Build Command    | Command to build the project             |
| Output Directory | Directory containing build output        |
| Install Command  | Command to install dependencies          |
| Root Directory   | Subdirectory containing the project      |

### Git Integration

| Field     | Description                       |
| --------- | --------------------------------- |
| Provider  | GitHub, GitLab, or Bitbucket      |
| Repo      | Repository path (org/repo)        |
| Branch    | Production branch                 |
| Connected | Whether Git integration is active |

---

## Use Cases

### Audit Projects Needing Updates

```bash
# List projects with deprecated Node.js versions
vercel project ls --update-required --json > deprecated-projects.json

# Process and notify
cat deprecated-projects.json | jq -r '.[] | "\(.name): \(.nodeVersion)"'
```

### Automated Project Setup

```bash
#!/bin/bash
# Create project if it doesn't exist

PROJECT_NAME="$1"

if vercel project inspect "$PROJECT_NAME" 2>/dev/null; then
  echo "Project $PROJECT_NAME already exists"
else
  vercel project add "$PROJECT_NAME"
  echo "Created project $PROJECT_NAME"
fi
```

### Export Project List

```bash
# Export all projects to CSV
vercel project ls --json | jq -r '.[] | [.name, .framework, .updatedAt] | @csv' > projects.csv
```

### Cleanup Unused Projects

```bash
#!/bin/bash
# List projects not deployed in 90 days

NINETY_DAYS_AGO=$(($(date +%s) - 7776000))000

vercel project ls --json | jq -r --arg cutoff "$NINETY_DAYS_AGO" \
  '.[] | select(.updatedAt < ($cutoff | tonumber)) | .name'
```

---

## See Also

- [link](link.md) - Link to a project
- [deploy](deploy.md) - Deploy a project
- [env](env.md) - Manage environment variables
- [domains](domains.md) - Manage domains
