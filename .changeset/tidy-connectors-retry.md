---
'@vercel/connect': patch
---

Try Eve token and authorization requests before provisioning, then provision and retry once only when the connector is missing or not linked to the project.
