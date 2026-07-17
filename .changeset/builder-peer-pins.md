---
'vercel': patch
---

Declare builders as optional `peerDependencies` and use the declared versions to pin dynamic Builder installs: bare specs install the version this CLI release was published with instead of `latest`, stale `.vercel/builders` copies are reinstalled, `@vercel/build-utils` is pinned to the CLI's own version, and post-install resolution failures now report a per-Builder reason instead of "Something went wrong!". Explicit Builder version pins are unchanged and always win. Builders remain in `dependencies`.
