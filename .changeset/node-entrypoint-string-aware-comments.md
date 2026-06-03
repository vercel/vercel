---
'@vercel/build-utils': patch
---

Fixed Node.js API entrypoint detection dropping functions whose source contains a `*/`-bearing string literal (e.g. an `Accept: */*` header) before a real block comment. The comment stripper used for entrypoint detection is now string-, template-literal-, and regex-aware, so it no longer treats `/*` inside a string as the start of a block comment and swallows the handler export.
