---
'@vercel/fs-detectors': minor
'vercel': patch
---

Support per-slug remote opt-in for experimental framework presets. Framework detection now accepts an `experimentalOverrides` map (e.g. `{ container: true }`); when `VERCEL_USE_EXPERIMENTAL_FRAMEWORKS` is not set, an experimental preset is still detected if its slug is enabled via the overrides. The CLI resolves these overrides (failing open) and threads them through project detection during `vc deploy` setup, so a preset like `container` can be graduated without requiring a CLI upgrade.
