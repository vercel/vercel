---
'@vercel/next': patch
---

Update static metadata outputs to not use ISR and handle them as purely static files. This change:
- Creates a new `.next/server/_metadata` folder for purely static metadata files
- Only treats metadata files with image extensions (jpg/png) as static files
- Continues to use ISR for metadata files with other extensions (for dynamic generation)
- Applies to metadata conventions like `favicon`, `icon`, `apple-icon`, `opengraph-image`, and `twitter-image`
