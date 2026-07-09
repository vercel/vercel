---
'vercel': major
---

`--yes` no longer selects a team on its own. It answers confirmations, not
data questions: when the account has multiple teams and no explicit signal
(`--scope`/`--team`, `vercel.json` `scope`, `VERCEL_ORG_ID`), an interactive
terminal now asks `Which team?` once and continues auto-confirmed, instead of
silently using the globally selected team from `vc switch` or the login
default. This also removes the all-teams project sweep from `vercel link
--yes`; matches are resolved within the chosen team, and a single Git-linked
root-directory match still links automatically.
