---
'vercel': major
---

`vercel routes export` now uses `--output` (`-o`) instead of `--format` to select the output file format (`json` or `ts`, dotted forms like `.ts` also accepted). This frees `--format` to align with the standard output-format convention used by other commands. Update any scripts from `routes export --format ts` to `routes export --output ts`.
