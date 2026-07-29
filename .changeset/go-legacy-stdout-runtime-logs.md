---
'@vercel/go': patch
---

Stop setting `runtimeLanguage` on legacy `api/` Go handler lambdas so their stdout is captured in runtime logs again. The field is reserved for functions using the native "executable" runtime (Go standalone server mode, Rust); tagging the go-bridge `provided` runtime lambda with it caused the platform to source logs from the executable-runtime pipeline, dropping the handler's stdout.
