---
name: vercel-link
description: "Vercel CLI: Link a local directory to a Vercel project."
metadata:
  version: 1.0.0
  openclaw:
    category: "deployment"
    requires:
      bins:
        - vercel
    cliHelp: "vercel link --help"
---

# vercel link

> **PREREQUISITE:** Read `../vercel-shared/SKILL.md` for auth, global flags, and security rules.

Link the current directory to a Vercel project. Creates `.vercel/project.json`.

## Usage

```bash
vercel link --yes --project <name> --team <slug>
```

## Flags

| Flag | Required | Default | Description |
|------|----------|---------|-------------|
| `--project` | Yes (non-interactive) | — | Project name or ID |
| `--team` | — | — | Team ID or slug |
| `--repo` | — | — | Link as repo (monorepo support, creates `repo.json`) |
| `--yes` / `-y` | Yes (non-interactive) | — | Skip confirmation prompts |
| `--dry-run` | — | — | Show what link would do without executing |

## Examples

```bash
# Link single project (non-interactive)
vercel link --yes --project my-app --team my-team --non-interactive

# Link monorepo
vercel link --repo --yes --non-interactive

# Dry-run to validate
vercel link --dry-run --project my-app --team my-team
```

## Tips

- Always provide `--project` and `--yes` in non-interactive mode — the command will fail if it needs to prompt
- Use `--repo` for monorepos with multiple projects
- Check `.vercel/project.json` vs `.vercel/repo.json` when debugging link issues
- Verify team with `vercel whoami` before linking

## See Also

- [vercel-shared](../vercel-shared/SKILL.md) — Global flags and auth
- [vercel-login](../vercel-login/SKILL.md) — Authenticate before linking
- [vercel-deploy](../vercel-deploy/SKILL.md) — Deploy after linking
