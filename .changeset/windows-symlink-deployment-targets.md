---
'@vercel/client': patch
---

Fix symlink targets being stored verbatim when deploying from Windows

`readlink()` results were written into the deployment as-is. On Windows that
produced two unusable shapes: junctions (which Windows falls back to whenever it
cannot create a directory symlink) always record an absolute target such as
`D:\repo\node_modules\...`, and relative targets use backslashes, which the POSIX
deployment filesystem reads as a single filename rather than path segments.

A Next.js app using `serverExternalPackages` hits this through
`.next/node_modules/<pkg>-<hash>`, the link that makes the external package
resolvable inside the lambda; it fails at runtime with `Cannot find module`.

Targets that resolve inside the deployment root are now rewritten relative to the
link, reproducing exactly what a Linux build emits. This covers both the default
per-file upload and `--archive=tgz`, whose tarball is the upload payload and so
never passed through the hashing path.
