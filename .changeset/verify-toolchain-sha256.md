---
"@vercel/build-utils": minor
"@vercel/rust": patch
"@vercel/node": patch
---

Verify SHA-256 of downloaded toolchain archives before extracting or executing them. Adds a shared `VerifiedDownloader` class and `extractZip` helper to `@vercel/build-utils`.

Both builders prefer a pre-installed toolchain on the build image when available. On Vercel's standard build container (Amazon Linux 2023), Rust and Bun are pre-installed and the download path is never exercised. The pinned, SHA-verified downloads remain the fallback for dev machines, CI environments, and any image without the toolchain pre-installed.

- **Rust**: accepts any pre-installed `cargo` on PATH (no rustup requirement). Downloads rustup-init (SHA-256 verified) only if neither cargo nor rustup is present.
- **Bun**: prefers pre-installed `bun` on PATH. Downloads the SHA-verified release when absent, using the baseline x64 build on Linux for broader CPU compatibility.
