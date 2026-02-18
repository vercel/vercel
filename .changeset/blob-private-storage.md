---
'vercel': minor
---

Add private Blob storage support:

- Create private stores: `vercel blob create-store my-store --access private`
- Upload to private stores: `vercel blob put file.txt --access private`
- Download blobs with the new `blob get` command: `vercel blob get file.txt --access private` (works with both public and private stores)
- Copy blobs: `vercel blob copy source.txt dest.txt --access private`
- Display access type (Public/Private) in `vercel blob store get` output

The `--access` flag defaults to `public` for backward compatibility.
