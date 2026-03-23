---
'@vercel/node': patch
---

Add experimentalAllowBundling support for API route lambdas, enabling the build container to combine multiple /api/* routes into fewer Lambda functions.
