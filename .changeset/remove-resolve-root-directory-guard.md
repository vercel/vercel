---
'vercel': patch
---

Remove the `VERCEL_RESOLVE_ROOT_DIRECTORY` guard, enabling monorepo subdirectory build fixes by default.

When a project is linked in place (`apps/api/.vercel/project.json`) and `vc build` is run from that directory, the build now always re-anchors to the detected repository root (workspace markers, then git) and expresses the project as its path relative to that root — previously this behavior was gated behind `VERCEL_RESOLVE_ROOT_DIRECTORY=1`. The `rootDirectory` setting is interpreted relative to the link's location and honored when it points at a folder that exists; otherwise it is ignored in favor of the link's own location and a warning is emitted. Standalone builds preserve package-manager symlinks so dependencies resolve at runtime.
