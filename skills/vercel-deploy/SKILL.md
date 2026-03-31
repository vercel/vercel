---
name: vercel-deploy
description: "Vercel CLI: Deploy a project to Vercel."
metadata:
  version: 1.0.0
  openclaw:
    category: "deployment"
    requires:
      bins:
        - vercel
    cliHelp: "vercel deploy --help"
---

# vercel deploy

> **PREREQUISITE:** Read `../vercel-shared/SKILL.md` for auth, global flags, and security rules.

Deploy the linked project to Vercel.

## Usage

```bash
vercel deploy [path] --yes --non-interactive
```

## Flags

| Flag | Required | Default | Description |
|------|----------|---------|-------------|
| `--prod` | — | — | Deploy to production |
| `--target` | — | `preview` | Target environment (production, preview, or custom) |
| `--yes` / `-y` | Yes (non-interactive) | — | Skip confirmation prompts |
| `--env` | — | — | Environment variable (KEY=VALUE, repeatable) |
| `--build-env` | — | — | Build environment variable (KEY=VALUE, repeatable) |
| `--meta` | — | — | Metadata (KEY=VALUE, repeatable) |
| `--force` | — | — | Force deploy, bypass change detection |
| `--prebuilt` | — | — | Deploy pre-built output from `vercel build` |
| `--format json` | — | — | JSON output |
| `--dry-run` | — | — | Validate everything without deploying |

## Examples

```bash
# Preview deployment
vercel deploy --yes --non-interactive

# Production deployment
vercel deploy --prod --yes --non-interactive

# With environment variables
vercel deploy --yes --env API_KEY=abc --env DB_URL=postgres://...

# Dry-run to validate before deploying
vercel deploy --dry-run --yes

# Prebuilt deploy (CI two-step)
vercel build --prod
vercel deploy --prebuilt --prod --yes --non-interactive
```

## Output

On success, stdout contains the deployment URL (plain text) or structured JSON:

```json
{
  "status": "ok",
  "message": "Deployed to https://my-app-abc123.vercel.app",
  "data": {
    "url": "https://my-app-abc123.vercel.app",
    "inspectorUrl": "https://vercel.com/team/project/abc123",
    "id": "dpl_abc123",
    "target": "preview",
    "readyState": "READY"
  },
  "next": [
    { "command": "vercel inspect dpl_abc123", "when": "View deployment details" },
    { "command": "vercel promote dpl_abc123", "when": "Promote to production" }
  ]
}
```

## Tips

- The project must be linked first (`vercel link`) — deploy will fail if `.vercel/` is missing
- Use `--dry-run` before production deploys to catch validation errors
- `--env` values must be `KEY=VALUE` format — the command rejects malformed inputs
- For CI workflows, use `VERCEL_TOKEN` env var + `--yes --non-interactive`

> [!CAUTION]
> This is a **write** command — confirm with the user before executing in production (`--prod`).

## See Also

- [vercel-shared](../vercel-shared/SKILL.md) — Global flags and auth
- [vercel-link](../vercel-link/SKILL.md) — Link before deploying
- [vercel-login](../vercel-login/SKILL.md) — Authenticate before deploying
