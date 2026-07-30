---
'vercel': patch
---

Added support for adding and removing variants with `vercel flags update`.
For example, use
`vercel flags update checkout-flow --add-variant treatment="Treatment"` to add
a variant, or
`vercel flags update checkout-flow --remove-variant legacy --yes` to remove
one.
