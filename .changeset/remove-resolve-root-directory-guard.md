---
'vercel': minor
---

Enable monorepo subdirectory build fixes by default (previously gated behind `VERCEL_RESOLVE_ROOT_DIRECTORY=1`), scoped to directories the workspace actually claims.

When a project is linked in place (`apps/api/.vercel/project.json`) and `vc build` is run from that directory, the build now re-anchors to the workspace root and expresses the project as its path relative to that root — so builders trace correctly, hoisted dependencies are packaged, and `--standalone` output preserves package-manager symlinks so dependencies resolve at runtime.

Re-anchoring only happens when an ancestor workspace manifest (`pnpm-workspace.yaml` or `package.json#workspaces`) actually declares the linked directory as a member package. Membership is decided by matching the directory's path against the manifest's declared patterns (including negations like `!apps/legacy`) plus a `package.json` existence check — pure string matching with no filesystem traversal, so large repositories and recursive patterns like `**` cost nothing. A project that merely sits inside an unrelated repository — a vendored folder, a fixture, a scratch project in a company monorepo, or a plain git repo with no workspace — is left untouched and builds from its own directory exactly as before.

The `rootDirectory` setting is interpreted relative to the link's location and honored when it points at a folder that exists; otherwise (e.g. a redundant `apps/api` setting on a link at `apps/api`, which previously crashed with `ENOENT .../apps/api/apps/api/...`) it is ignored in favor of the link's own location and a warning is emitted.

To restore the previous behavior, pin an earlier CLI version.
