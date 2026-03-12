---
'@vercel/client': patch
---

Fix bulkRedirectsPath with --prebuilt to support directories

When using `bulkRedirectsPath` with `--prebuilt` deployments, the path can now point to either a file or a directory containing redirect files. Previously, only single files were supported, causing deployments to fail with "No files found at path" when using a directory.
