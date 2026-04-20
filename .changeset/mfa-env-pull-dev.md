---
"vercel": patch
---

Require two-factor authentication for `vc env pull`, `vc dev`, and `vc pull` when invoked interactively. Users without MFA enabled on their account are prompted to enable it. Users with MFA enabled are re-authenticated through the device-code login flow to mint a fresh token. Automated contexts (`CI` env var or `VERCEL_TOKEN` set) are unaffected.
