---
'vercel': patch
---

Align hidden `vc experiment` with the feature-flags experiment API: metrics are embedded on the flag (`primaryMetrics` / `guardrailMetrics` as Metric objects), not `PUT`/`GET` `/v1/projects/.../feature-flags/metrics`. `experiment create` takes repeatable `--metric '<json>'`; `experiment metrics add` uses `--flag` and PATCH; `experiment metrics list` requires the flag slug.
