---
'vercel': minor
---

[cli] `integration add` now suggests installing the matching Claude Code skill (if the product exposes one) by printing a ready-to-run `npx skills add <url> --skill <name>` command. The suggestion is also surfaced as a `skill` field in `--format=json` output. Suggestion is skipped silently when the product has no associated skill.
