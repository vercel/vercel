---
'@vercel/frameworks': minor
'@vercel/fs-detectors': minor
'vercel': minor
---

Resolve the frameworks manifest at runtime during framework detection.

`@vercel/frameworks` now sources its framework list from the frameworks
manifest (`https://api-frameworks-two.vercel.sh/v1/frameworks.json`). A pinned
copy is checked in as `frameworks.json` and refreshed at build time, and the
new `resolveFrameworks()` API prefers the remote manifest (cached locally for
24 hours) with the pinned copy as offline fallback. This allows newly
published framework presets to be detected and built without a CLI release.

**This is initially a no-op for framework consumers**: the pinned manifest is
identical in content to the previous hand-written list, and the existing
`frameworks` / `frameworkList` exports are unchanged in shape and behavior
(note: the `frameworks` export is now typed `readonly Framework[]` instead of
a literal tuple). CLI behavior will begin to differ once new presets are
rolled out to the remote manifest.

Manifest entries may declare an optional `minCliVersion`. Presets requiring a
newer CLI are still detected: `vc build` warns that an upgrade is required and
continues with the best available preset, unless the entry sets
`failOnStale: true`, in which case the build fails with an upgrade prompt.
Set `VERCEL_SKIP_REMOTE_FRAMEWORKS=1` to always use the pinned manifest.

`detectBuilders()` in `@vercel/fs-detectors` accepts a new optional
`frameworkList` option so callers can supply the runtime-resolved presets.
