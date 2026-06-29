---
'@vercel/container': patch
---

Fix container layer cache never warming between builds. The buildah image store
is now kept under the project work dir's `.vercel/cache`, and `prepareCache`
globs it relative to `workPath` so the returned cache keys are project-relative
and the platform restores them to the same path on the next build. Previously
the store was anchored outside the work dir, so `prepareCache` produced keys the
restore step could not place and buildah always started cold.
