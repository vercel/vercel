---
'vercel': patch
---

Add `vercel project protection trusted-ips get|set|disable` to manage the Trusted IPs allowlist for deployment protection. IPv4/CIDR input is validated locally before any request; IPv6 is rejected.
