# vercel link

Link a local directory to a Vercel project.

## Synopsis

```bash
vercel link [options]
```

## Description

The `link` command connects your local directory to a Vercel project, enabling project-specific operations like environment variable management, deployments, and configuration pulls.

## Options

| Option      | Shorthand | Type    | Description                                               |
| ----------- | --------- | ------- | --------------------------------------------------------- |
| `--repo`    | `-r`      | Boolean | Link multiple projects based on Git repository (monorepo) |
| `--project` | `-p`      | String  | Specify project name directly                             |
| `--yes`     | `-y`      | Boolean | Use default scope and settings, skip prompts              |

## Examples

### Interactive Link

```bash
vercel link
```

Prompts to select or create a project.

### Link to Specific Project

```bash
vercel link --project my-existing-project
vercel link -p my-project
```

### Link with Defaults

```bash
vercel link --yes
```

Uses default team/user scope and creates project if needed.

### Link Specific Directory

```bash
vercel link --cwd /path/to/project
```

### Monorepo Link

```bash
vercel link --repo
```

Links multiple projects in a monorepo based on Git repository.

---

## Link File

After linking, a `.vercel` directory is created:

```
.vercel/
├── project.json    # Project and org IDs
└── README.txt      # Info about the directory
```

### project.json

```json
{
  "projectId": "prj_abc123",
  "orgId": "team_xyz789"
}
```

---

## Unlinking

To unlink, remove the `.vercel` directory:

```bash
rm -rf .vercel
```

Then link to a different project:

```bash
vercel link --project different-project
```

---

## Monorepo Support

For monorepos with multiple projects:

```bash
# Link entire repository
vercel link --repo

# This creates links based on:
# - vercel.json configurations
# - Directory structure
# - Git repository settings
```

### Monorepo Structure

```
monorepo/
├── apps/
│   ├── web/           # → web-project
│   └── api/           # → api-project
├── packages/
│   └── shared/
└── vercel.json
```

---

## CI/CD Usage

```yaml
- name: Link Project
  run: vercel link --yes --token ${{ secrets.VERCEL_TOKEN }}

- name: Pull Config
  run: vercel pull --yes

- name: Deploy
  run: vercel deploy --yes
```

---

## See Also

- [project](project.md) - Manage projects
- [pull](pull.md) - Pull project settings
- [env](env.md) - Manage environment variables
