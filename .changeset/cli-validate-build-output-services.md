---
'vercel': patch
---

`vc build` output validation now understands the `services/<name>/` layout. A services-only build no longer false-warns about missing `functions`/`static` output, and each service's `config.json` and deployable output are validated the same way as the top-level Build Output API directory.
