---
'vercel': patch
---

Fix SDK key detection for Vercel Flags to avoid false positives with third-party identifiers. Previously any `vf_` prefix matched, now only `vf_server_` and `vf_client_` prefixes match.