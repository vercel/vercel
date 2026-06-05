---
'@vercel/build-utils': patch
---

Fix Node.js API entrypoint detection dropping functions whose source contains comment-like sequences (`/*`, `//`, `*/`) inside string, template, or regex literals — for example an `Accept: */*` header. Handler exports are now identified with the ES/CJS module lexers instead of stripping comments with regexes, so the contents of literals are never mistaken for comments.
