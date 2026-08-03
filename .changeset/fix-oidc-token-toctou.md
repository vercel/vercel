---
'@vercel/oidc': patch
---

Fix TOCTOU race when persisting OIDC token files by writing tokens via a temp file with mode 0600 and atomically renaming into place.
