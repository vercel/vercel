---
'vercel': minor
---

Support `has` and `missing` route conditions in `vercel dev`. Routes with `has` were previously dropped with a warning; they are now evaluated against the incoming request (headers, cookies, query string, and host), including regex values with named groups usable as `$name` substitutions in `dest`, plus the `eq`/`neq`/`inc`/`ninc`/`pre`/`suf`/`re`/`gt`/`gte`/`lt`/`lte` value matchers. Routes with `missing` (previously matched unconditionally) are now skipped when the condition is present.
