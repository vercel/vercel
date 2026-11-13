---
'@vercel/build-utils': patch
---

Support `devEngines.packageManager` for detecting the intended package manager when the top-level `package.json#packageManager` field is absent. `devEngines.packageManager` may be a single object (`{ name, version, onFail }`) or an array of them (the first entry with a recognized `name` is used). The existing `package.json#packageManager` field still takes precedence for backwards compatibility, and an unrecognized `name` falls back to the existing lockfile-based detection instead of failing the build.
