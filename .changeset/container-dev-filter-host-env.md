---
'@vercel/container': patch
---

`vc dev` no longer leaks host/shell-only environment variables into container
services. Variables that describe the developer's machine rather than the Linux
container — notably macOS `TMPDIR` (`/var/folders/.../T`), plus `HOME`, `PATH`,
`SHELL`, and similar — are now filtered out of the container's env. Previously
they were passed through and broke apps that write to the OS temp dir (e.g.
Ghost's multer upload middleware failed with `EACCES`). The container's own
values for these are used instead.
