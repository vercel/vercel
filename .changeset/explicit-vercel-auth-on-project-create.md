---
'vercel': patch
---

Send an explicit `ssoProtection` setting when creating a project so Vercel Auth no longer relies on the server-side default. New projects created with standard protection now explicitly enable protection across production deployment URLs and all previews.
