---
'@vercel/next': patch
---

Remove the `x-nextjs-data` request header for non-`/_next/data` routes before Next.js data route normalization.
