---
'vercel': patch
---

[cli] standardize non-interactive context propagation via env var

Preserve existing non-interactive behavior while standardizing suggested next commands to use VERCEL_NON_INTERACTIVE instead of forwarding --non-interactive as a global flag. This keeps automation context consistent across command retries and centralizes parsing logic with focused unit coverage.
