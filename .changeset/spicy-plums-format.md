---
'vercel': minor
---

Add a declarative output-format framework for CLI commands. A command can declare the formats it supports (e.g. `outputFormats: ['json', 'table']`), which generates both `--format=<fmt>` and per-format boolean aliases (`--json`, `--table`), resolved through a single `resolveOutputFormat` accessor that errors on conflicting formats. The `--json` flag is no longer deprecated.
