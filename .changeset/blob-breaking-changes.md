---
'vercel': major
---

feat(cli): blob command improvements and breaking changes

**Breaking Changes:**
- `--access` flag is now required for `put`, `copy`, `get`, and `create-store` (no longer defaults to `public`)
- `--force` flag removed from `blob put` (use `--allow-overwrite` instead)
- `blob store add|remove|get` subcommands removed (use `blob create-store`, `blob delete-store`, `blob get-store`)

**New Features:**
- `blob list-stores` (`ls-stores`): browse blob stores interactively or pipe as a table
- `blob empty-store`: delete all blobs in a store with confirmation
- `blob get-store` and `blob list-stores` now show a dashboard link
- `blob create-store` interactive prompt now shows Private first with doc links
- `blob delete-store` now shows connected projects in confirmation and auto-pulls `.env.local` after deletion
