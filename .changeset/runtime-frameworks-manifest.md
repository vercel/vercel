---
'@vercel/frameworks': minor
'@vercel/fs-detectors': minor
'vercel': minor
---

Resolve the frameworks manifest at runtime during framework detection.

`@vercel/frameworks` now sources its framework list from the frameworks
manifest, pinned at build time as `frameworks.json` (a build artifact, not
checked into git). The new `resolveFrameworks()` API prefers the remote
manifest (cached for 24 hours) with the pinned copy as offline fallback, so
new presets can be detected and built without a CLI release. Set
`VERCEL_SKIP_REMOTE_FRAMEWORKS=1` to always use the pinned manifest.

This is initially a no-op: the pinned manifest matches the previous list and
existing exports are unchanged in shape (`frameworks` is now typed
`readonly Framework[]` instead of a literal tuple). Once new presets roll out
remotely, `vc build` will detect them and warn when a preset requires a newer
CLI (or fail, for presets marked `failOnStale`).

`detectBuilders()` in `@vercel/fs-detectors` accepts a new optional
`frameworkList` option.
