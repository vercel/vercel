---
'@vercel/container': minor
---

Vendor private Podman runtime via this repo's Vercel deployment. Each push has a unique dist `https://<preview>.vercel.app/runtimes/podman/v<ver>/podman-<platform>.tar.gz`; prod alias is `https://vercel.com/runtimes/podman/...`. `private.ts` now supports `file://` asset URLs for local tarball testing (`VERCEL_PODMAN_ASSET_URL=file:///tmp/…`), lazy CDN manifest with preview-host rebasing, and honest size messaging. Build with `pnpm --filter @vercel/container build:podman-tarballs -- --local` then `VERCEL_PODMAN_ASSET_URL=file://… VERCEL_CONTAINER_ENGINE=podman-private vercel dev`.
