---
'@vercel/oidc': patch
---

Share one in-flight OAuth refresh between concurrent callers (at the token-acquisition level, so it holds regardless of project/team/buffer), and stop erasing the Vercel CLI login (`auth.json`) on transient refresh failures. If another process saved a fresh login in the meantime, it is used instead. A definitive `invalid_grant` (revoked refresh token) still clears the login so the next call reports a missing login.
