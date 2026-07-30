---
'@vercel/build-utils': minor
'@vercel/go': minor
'@vercel/backends': minor
'@vercel/python': minor
'@vercel/fs-detectors': patch
---

Add virtual filesystem support to builder `detectEntrypoint` functions.

Introduces an `EntrypointDetectorFilesystem` interface in
`@vercel/build-utils` and an optional `fs` parameter on
`DetectEntrypointOptions`. When provided, builders read files through
the virtual filesystem instead of Node's `fs` module, enabling
entrypoint detection for API-based git providers (Bitbucket, GitLab)
without requiring a local clone.
