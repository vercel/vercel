---
'@vercel/container': minor
'@vercel/fs-detectors': minor
'@vercel/frameworks': patch
'@vercel/build-utils': patch
---

Add experimental PHP Cloud Native Buildpack builds and zero-config Laravel
detection behind `VERCEL_EXPERIMENTAL_BUILDPACK_PHP=1`. Laravel services build
with the digest-pinned Paketo PHP and optional Node.js buildpacks, compile the
conventional frontend `build` script, and run through nginx and PHP-FPM with
production defaults that remain overridable by project environment variables.
The Laravel preset also stages Vercel's Composer adapter through a bundled
integration buildpack, selects Blob and Queues defaults, and emits a default
`queue/v2beta` trigger without changing the application's source or lockfile.
