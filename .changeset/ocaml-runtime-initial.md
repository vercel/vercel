---
'@vercel/ocaml': minor
'@vercel/fs-detectors': patch
---

Add `@vercel/ocaml` runtime for zero-config OCaml deployments.

This new runtime enables deploying OCaml HTTP servers to Vercel with automatic detection:
- Zero-config: Projects with `dune-project` are automatically detected
- Framework support: Works with Dream, Cohttp, Opium, or any HTTP server listening on `$PORT`
- Fast cached builds: opam switches and dune build artifacts are cached
- Static file support: Files in `public/` are served via CDN

Key features:
- Native OCaml bootstrap (`vc-init.ml`) handles Vercel IPC protocol
- Automatic opam dependency installation
- Incremental dune builds with caching
- Response streaming support

Example Dream app deployment requires no configuration - just deploy!
