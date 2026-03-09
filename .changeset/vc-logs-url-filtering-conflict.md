---
'vercel': patch
---

Fix `vc logs` error when passing a deployment URL with filtering flags like `--since` or `--until`. Previously, a positional deployment URL would implicitly enable `--follow`, which conflicts with filtering flags and produced a confusing error. Now, when filtering flags are present, the implicit `--follow` is suppressed and the deployment URL is used as a deployment filter instead.
