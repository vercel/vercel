---
'@vercel/client': minor
'vercel': patch
---

Skip the Rust `target/` directory by default for Rust projects.

Rust projects produce a `target/` directory of build artifacts that can be
hundreds of MB. It's rebuilt on Vercel during the deployment (and cached
server-side), so uploading it only slows deployments down. When a root
`Cargo.toml` is detected, `target/` is now ignored by default during
`vercel deploy` and `vercel dev`. Users can opt back in with `!/target` in
their `.vercelignore`.

Also hardened the local file scanner used by `vercel dev` so that a directory
removed mid-scan (a common race with `cargo build` churning `target/`) is
skipped instead of crashing the process.
