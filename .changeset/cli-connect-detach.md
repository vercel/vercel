---
'vercel': minor
---

Add `vercel connect detach` to detach a Vercel project from a connector via `DELETE /v1/connect/connectors/:id/projects/:projectId`. Mirrors `vercel connect attach` and matches the project-scope "Disconnect" button in the dashboard.

Add `--triggers`, `--trigger-branch`, and `--trigger-path` flags to `vercel connect attach`. When `--triggers` is set, the project is also registered as a trigger destination on the connector via `PATCH /v1/connect/connectors/:id/trigger-destinations` so verified webhooks get forwarded to it. Requires the connector to support triggers; warns if the connector was created without `triggers.enabled`.

Both features gated behind the existing `FF_CONNEX_ENABLED` flag.
