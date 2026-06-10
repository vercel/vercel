---
'vercel': patch
---

Fix the darwin-arm64 native CLI binary crashing with SIGSEGV on most commands. The custom Node
runtime was stripped with bare `strip`, which removes the exported `napi_*` symbols that native
addons (`@napi-rs/keyring`) bind against at dlopen time. The runtime is now stripped with
`strip -SXx`, which keeps exported symbols. Also makes the `@vercel/vc-native` bin shim launch
the platform binary directly when the postinstall script did not run (pnpm blocks dependency
build scripts by default), instead of always failing.
