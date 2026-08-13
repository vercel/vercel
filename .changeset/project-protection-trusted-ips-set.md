---
'vercel': patch
---

Add `vercel project protection trusted-ips set|disable` to replace or clear the Trusted IPs allowlist. IPv4/CIDR input is validated locally before any request; IPv6 is rejected; disable requires confirmation (`--yes` in non-interactive mode).
