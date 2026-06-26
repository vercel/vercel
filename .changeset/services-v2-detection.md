---
'@vercel/fs-detectors': minor
'vercel': minor
---

- Migrate service auto-detection to V2 format.
- Layout auto-detect now resolves via the V2 resolver and generates top-level service-targeted rewrites and per-service path transform routes.
- CLI build and dev server merge auto-detected rewrites into the route table.
