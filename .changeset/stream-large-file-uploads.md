---
'@vercel/client': patch
---

Stream files larger than 2 GiB when hashing and uploading, instead of reading them into a single Buffer. Deployments containing a file above Node's `fs.readFile` limit previously failed with `ERR_FS_FILE_TOO_LARGE` ("File size ... is greater than 2 GiB"); they are now hashed and uploaded as streams.
