---
'vercel': patch
---

`vercel env update` now applies the same Development guards as `vercel env add`:

- Errors with a docs-linked message when the selected record targets Development and the team has the Sensitive Environment Variables Policy enabled. No PATCH is attempted.
- Errors when `--sensitive` is used on a record that targets Development (regardless of policy). Sensitive is not allowed on Development.

Other `env update` behavior is unchanged.
