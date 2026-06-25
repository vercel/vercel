---
'vercel': patch
---

Add `vercel edge-config backups` for listing, inspecting, and restoring Edge Config backups.

Examples:

- `vercel edge-config backups my-store`
- `vercel edge-config backups my-store --backup-version <backup-version-id> --format json`
- `vercel edge-config backups my-store --restore <backup-version-id> --yes`
