---
'@vercel/container': patch
---

Fix schedule images failing to build with the Buildah store cache (`VERCEL_BUILDAH_STORE_CACHE=1`). The dispatcher image now builds from the local schedule image instead of pulling it from the registry, which doesn't have it yet.
