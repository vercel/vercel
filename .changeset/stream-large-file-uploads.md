---
'@vercel/client': patch
'vercel': patch
---

Handle deployments containing very large files without crashing. Files larger than Node's `fs.readFile` limit (~2 GiB) are now hashed and uploaded by streaming instead of being read into a single Buffer (which threw `ERR_FS_FILE_TOO_LARGE` — "File size ... is greater than 2 GiB"), and the CLI upload progress no longer assumes every file is held in memory. When a file still exceeds the server's per-request upload limit (HTTP 413), the CLI now suggests `--archive=tgz`, which uploads the deployment in smaller chunks.
