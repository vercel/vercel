---
'vercel': patch
---

Rewrite the `Linked` / `Inspect` / `Production` output lines for the `vc` link + deploy flow.

- Drop the `🔗`, `🔍`, `⏳` emojis. Typography (bold labels) carries the meaning more cleanly and renders consistently across terminals.
- Drop the `(created .vercel and added it to .gitignore)` parenthetical — it's implementation detail; `git status` surfaces it on demand.
- Rename `Production:` to `Live`. Shorter, pairs naturally with `Inspect`, fits the same 9-char label column.
- Align the three labels (`Linked`, `Inspect`, `Live`) at a shared column so the URLs land at the same position when all three appear together.
- Drop the `[2s]` timing suffix from URL lines. URLs are results, not operations — timing belongs on the build/ready line.
