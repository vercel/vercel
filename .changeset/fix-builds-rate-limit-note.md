---
'vercel': patch
---

Surface the builds rate-limit upgrade hint on `vercel deploy`. The hint previously never printed (the error was dropped before conversion) and pointed at the CLI self-updater; it now renders the backend's plan-appropriate call to action (`ctaLabel`/`ctaUrl`, or legacy `action`/`link`) from the error, falling back to a plan-agnostic nudge.
