---
"@vercel/build-utils": minor
"@vercel/go": minor
"@vercel/rust": patch
"@vercel/node": patch
---

Verify SHA-256 of downloaded toolchain archives before extracting or executing them. Adds a shared `VerifiedDownloader` class and `extractZip` helper to `@vercel/build-utils`.

All three builders prefer a pre-installed toolchain on the build image when available. On Vercel's standard build container (Amazon Linux 2023), Rust and Bun are pre-installed and the download path is never exercised; Go's SHA-verified bootstrap installs Go 1.23.12 on first use until Go is added to the image, at which point that path also becomes inert. The pinned, SHA-verified downloads remain the fallback for dev machines, CI environments, and any image without the toolchain pre-installed.

- **Rust**: accepts any pre-installed `cargo` on PATH (no rustup requirement). Downloads rustup-init (SHA-256 verified) only if neither cargo nor rustup is present.
- **Bun**: prefers pre-installed `bun` on PATH. Downloads the SHA-verified release when absent, using the baseline x64 build on Linux for broader CPU compatibility.
- **Go**: delegates version resolution to Go's own toolchain mechanism (`GOTOOLCHAIN`). When `go.mod` pins a specific patch version or a `toolchain` directive, the builder sets `GOTOOLCHAIN=goX.Y.Z` so Go downloads and verifies the requested toolchain via `sum.golang.org` (cryptographic transparency log). Eliminates per-version SHA bookkeeping in the builder.
