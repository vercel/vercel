---
name: vercel-login
description: "Vercel CLI: Authenticate with Vercel via browser OAuth."
metadata:
  version: 1.0.0
  openclaw:
    category: "deployment"
    requires:
      bins:
        - vercel
    cliHelp: "vercel login --help"
---

# vercel login

> **PREREQUISITE:** Read `../vercel-shared/SKILL.md` for auth, global flags, and security rules.

Authenticate with Vercel via browser-based OAuth device code flow.

## Usage

```bash
vercel login
```

## Flags

| Flag | Required | Default | Description |
|------|----------|---------|-------------|
| `--dry-run` | — | — | Show what login would do without initiating OAuth |

## Agent Flow

1. Run `vercel login --non-interactive`
2. Command emits `action_required` JSON with `verification_uri` and `user_code`
3. **A human must visit the URL and complete browser auth** — surface this to the user
4. Command continues polling and emits `ok` JSON on success

```json
{
  "status": "action_required",
  "reason": "login_required",
  "userActionRequired": true,
  "verification_uri": "https://vercel.com/device",
  "data": { "user_code": "ABCD-1234" }
}
```

## Tips

- Login is a one-time operation — credentials persist in `~/.vercel/auth.json`
- For CI/headless, use `VERCEL_TOKEN` env var instead of `vercel login`
- After login, run `vercel link` to connect a project

> [!CAUTION]
> This command requires **human interaction** — an agent cannot complete browser OAuth alone.

## See Also

- [vercel-shared](../vercel-shared/SKILL.md) — Global flags and auth
- [vercel-link](../vercel-link/SKILL.md) — Link a project after login
- [vercel-deploy](../vercel-deploy/SKILL.md) — Deploy after linking
