---
'vercel': patch
---

Report `vercel flags evaluations` buckets that used the default in code as `"variant": null` instead of `"variant": ""`. The observability API attributes evaluations without an assigned variant to an empty variant id, which `--json` output surfaced as an empty string that matched no entry under `variants`. Human-readable output continues to label them `Default in Code`.
