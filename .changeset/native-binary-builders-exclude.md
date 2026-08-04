---
'vercel': patch
---

Keep builders out of the native binary SEA snapshot and load them exclusively through `importBuilders`:

- detect-entrypoint loads builder `detectEntrypoint` helpers via `importBuilders` instead of static builder imports, and the binary build refuses to stage any `package.json#builders` package.
- Treat SEA `ENOENT` like `MODULE_NOT_FOUND` when resolving builders so the install fallback runs for VFS ghost paths.
- Enforce exact `builders` manifest pins for bare builder specs (exact-version pins only — range-shaped pins cannot force reinstalls), reinstalling into `.vercel/builders` on mismatch, including CLI-local resolves.
- `utils/pack.ts` rewrites `builders` entries to preview tarball URLs; `importBuilders` installs bare specs from those URL pins and revalidates cached URL-pinned builders against the CLI's preview pack suffix (`-${sha}`), reinstalling when the cache came from a different preview deployment.
- Tag `vc.installBuilders` spans with `pinned` / `pinnedPackages` when installs use pinned versions.

Also fixes affected unit-test CI steps to invoke global turbo@2.10.8 instead of workspace pnpm turbo 2.5.0, which rejects combining `--affected` with `--filter`.
