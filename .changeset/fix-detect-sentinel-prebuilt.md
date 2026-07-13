---
'@vercel/container': patch
---

Fix `<detect>` entrypoint sentinel leaking as a prebuilt image reference.

When fs-detectors resolved a container service with no Dockerfile and
`VERCEL_BUILDPACKS=1`, it set the entrypoint to the `<detect>` sentinel.
The container builder's `resolveImageHandler` treated this sentinel as a
prebuilt OCI image reference (because it was truthy), skipping the
buildpack detection path and producing `"Using prebuilt image <detect>"`
with no deployable output.

Now `<detect>` is explicitly excluded from the prebuilt-image fallback in
both `resolveImageHandler` (build path) and `resolveDevImage` (dev path),
so the buildpack detection runs correctly.
