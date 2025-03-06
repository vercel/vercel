---
'vercel': patch
---

fix(oauth): improve unexpected error handling #13138

This is a follow-up on #12098

In case of an unexpected server response, we will now gracefully exit and log the error response for the user.
