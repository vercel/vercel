---
'vercel': patch
---

Skip SAML-protected ("limited") teams during `vercel link`'s cross-team auto-detect so it no longer forces device-code re-authentication for scopes the user did not explicitly choose. The project is still linked from any accessible team where it's found, and limited scopes remain available through the standard scope picker (`selectOrg`) or `--scope <slug>`.
