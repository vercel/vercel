---
'vercel': minor
---

Flatten blob store commands: `blob create-store`, `blob delete-store`, `blob get-store`.
Rename `--force` to `--allow-overwrite`.
Add conditional headers: `--if-match` for put/del/copy, `--if-none-match` for get.
Old commands and options are deprecated but still work.
