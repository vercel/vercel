---
'vercel': patch
---

Fix `firewall overview` failing on plans without IP Bypass. The command no longer errors when the bypass endpoint is unavailable, and reports system mitigation status from the project rather than the plan-gated bypass API.
