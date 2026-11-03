---
'vercel': patch
---

Add the experimental `VERCEL_EXPERIMENTAL_HTTP2_UPLOADS=1` environment variable, which uploads deployment files over a few shared HTTP/2 connections instead of one HTTP/1.1 connection per concurrent upload. It has no effect when a proxy is configured.
