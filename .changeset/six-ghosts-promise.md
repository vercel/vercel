---
'@vercel/python': patch
---

Reduce lambda threshold bytes when VERCEL_DEPLOYMENT_HAS_OTEL_LAYER is set.

When the deployments use the otel collector it can push the deployment over the limit since we don't account
for the size overhead added by this layer. Reduce the total uncompressed size for these types of deployments.
