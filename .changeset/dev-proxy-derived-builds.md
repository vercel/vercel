---
'vercel': patch
---

Fix `vercel dev` failing with `PROXY_AND_BUILDS` for any project that configures `proxy` in `vercel.json`. The dev server synthesizes the proxy build into its in-memory config and then re-ran the authored-config validator over that derived plan, which rejected the pairing it had just created itself.
