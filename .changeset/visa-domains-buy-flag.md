---
'vercel': minor
---

Added `--visa` flag to `vercel domains buy` (and `vercel buy domain`) for paying with a Visa Intelligent Commerce credential. The credential is collected via a masked interactive prompt and forwarded to the purchase API as an opaque `payment` field; the default card-on-file flow is unchanged.
