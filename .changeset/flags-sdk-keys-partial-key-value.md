---
'vercel': minor
---

`vercel flags sdk-keys ls` now surfaces the server-masked `partialKeyValue` preview (e.g. `vf_server_abc********`) in a new column of the default table output, between `Label` and `Created`. The `--json` output also includes `partialKeyValue` on each row.
