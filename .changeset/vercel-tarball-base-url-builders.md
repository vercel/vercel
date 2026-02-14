---
vercel: patch
---

Support installing builders from a tarball base URL (e.g. e2e workflow dplUrl) via `VERCEL_TARBALL_BASE_URL`. When set, builders are fetched from `${VERCEL_TARBALL_BASE_URL}/tarballs/<package>.tgz` instead of the npm registry.
