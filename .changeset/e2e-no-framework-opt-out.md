---
---

Added an e2e test (`e2e-curl-deploy-no-framework.test.ts`) that verifies an explicit "no framework" opt-out is respected: a project created with `framework: null` via the projects API does not have first-deployment framework detection run over it, and the framework stays `null` instead of being overwritten with a detected slug.
