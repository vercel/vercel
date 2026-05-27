---
'vercel': patch
---

fix(cli): warn when `env add --value V --yes` defaults to sensitive (Production/Preview)

Since CLI 53.x, `vercel env add NAME production --value V --yes` stores
variables as sensitive by default. Sensitive values are encrypted at rest
and cannot be retrieved later via the dashboard or `vercel env pull`.

Previously, this retrieval limitation was only surfaced through an
interactive "Make it sensitive?" prompt that was skipped when `--yes` or
`--value` bypassed the confirm flow. Users would only discover the issue
after running `vercel env pull` and seeing an empty value.

This change shows the retrieval-limitation notice whenever a variable is
stored as sensitive and the interactive prompt was not displayed — whether
the default sensitive behaviour applies (Production/Preview without
`--no-sensitive`), the team policy enforces it, or `--sensitive` is set
explicitly with `--yes`. Encrypted variables (`--no-sensitive`) are
unaffected and still silently succeed.

Closes #16232
