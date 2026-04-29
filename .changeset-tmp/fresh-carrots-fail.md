---
'@vercel/frameworks': patch
---

Fix the frameworks demo URL public-access test to check the public `/_logs` route instead of looking up alias hosts through the deployments API.
