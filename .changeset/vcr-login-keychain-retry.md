---
'vercel': patch
---

Recover `vcr login` from a stale macOS keychain entry ("The specified item already exists in the keychain. (-25299)") by logging out of the registry and retrying the login once.
