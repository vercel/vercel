---
'vercel': patch
---

Persist the rotated refresh token after the `vc env pull` step-up authentication. The step-up rotates the token pair server-side and revokes the previous refresh token, so keeping the old one caused subsequent step-ups to fail with `Device authorization request failed` and eventually forced a re-login.
