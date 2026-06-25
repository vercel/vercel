---
"@vercel/connect": patch
---

Add default-on first-use connector provisioning to `connect()` from `@vercel/connect/eve`. When the helper runs inside a Vercel deployment, it now posts the eve connection URL and connector UID to the managed OAuth create/link endpoint before token or consent calls, so Connect can create a missing connector or link an existing one to the OIDC project and eligible environments. Pass `autoProvision: false` to keep managing the connector link manually.
