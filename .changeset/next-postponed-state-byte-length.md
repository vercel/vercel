---
'@vercel/next': patch
---

Declare the postponed state length of a partially prerendered output in bytes, so the CDN splits the output at the right offset when the state contains a multi-byte character.
