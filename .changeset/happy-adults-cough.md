---
"@vercel/routing-utils": patch
'@vercel/config': patch
vercel: patch
---

[routing-utils] support `request.path` transforms on routes and high-level rewrites, lowering path-to-regexp parameters such as `/:path*` to low-level capture references such as `/$1`
[config] support request path transforms in the router builder
[cli] preserve request path transform syntax and environment metadata across AI/manual route edits
