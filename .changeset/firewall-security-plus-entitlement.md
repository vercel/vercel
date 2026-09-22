---
'vercel': patch
---

`vercel firewall` now recognises Security+ enabled on a single project, not just team-wide. Projects carrying it themselves were told OWASP required an upgrade they had already bought, and `firewall status --json` reported `requiresUpgrade` for them.

`firewall overview` also counts a DDoS episode reported only by the alerts API, which is where Security+ accounts receive them.
