---
'@vercel/container': patch
---

Fix container layer cache never warming between builds. buildah's image store
must run at the fixed XFS graphroot (`/vercel/.containers/storage`) so the
native overlay driver initializes — it can't run under the project work dir,
which is on the cell's overlayfs rootfs (overlay can't nest on overlay). But the
platform only persists `.vercel/cache` under the work dir. So `prepareCache` now
mirrors the store out to `<workPath>/.vercel/cache` (globbing relative to
`workPath` so keys are project-relative and restore correctly), and `build()`
copies the cached mirror back to the graphroot before building. Previously the
cache keys were anchored outside the work dir, so the restore step couldn't
place them and buildah always started cold.
