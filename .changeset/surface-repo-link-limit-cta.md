---
'vercel': patch
---

Surface the `action`/`link` (and newer `ctaLabel`/`ctaUrl`) fields on `repo_links_exceeded_limit` errors from `vercel git connect` instead of dropping them, so users hitting the projects-per-repository limit see the relevant next step and URL.
