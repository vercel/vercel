---
'@vercel/client': patch
---

checkDeploymentStatus now retries up to 3 times on HTTP 429 or 5xx
