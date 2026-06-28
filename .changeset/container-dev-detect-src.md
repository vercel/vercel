---
'@vercel/container': patch
'vercel': patch
---

Fixed `vercel dev` for the `container` framework when used as a top-level build (outside of `services`).

- The dev server now maps the container preset's `<detect>` sentinel to a discovered Dockerfile (`Dockerfile.vercel`, `Containerfile.vercel`, `Dockerfile`, or `Containerfile`), so the build is recognized instead of warning that it "did not match any source files".
- The `@vercel/container` `build()` path no longer throws `` `vercel dev` cannot build container images from a Dockerfile `` during dev. Containers are always built from a Dockerfile/Containerfile (there is no prebuilt-image input); in dev the image is built and run locally by `startDevServer`, so `build()` returns a stable local tag without pushing to a registry.
- The dev server no longer treats a container build output (an OCI image reference, `runtime: "container"`) as a zip-based function. It previously failed with `output.createZip is not a function` while trying to spin the image up under `fun`; container outputs are now skipped there and served by the builder's `startDevServer` instead.
- The dev path (`startDevServer`) now discovers the `Dockerfile.vercel` / `Containerfile.vercel` opt-in markers when the container entrypoint is the `<detect>` sentinel, matching the build path. Previously it only looked for a bare `Dockerfile`, so a project using a `.vercel` marker failed with "Container service must specify an entrypoint…" even though deploys worked. The discovery helper is now shared between the build and dev paths.
- `vercel dev` now fails fast with a clear message when the Docker daemon isn't running ("Could not connect to the Docker daemon. Start Docker…") instead of a cryptic `Container "undefined" exited (code 125) before becoming ready.`. Container start failures also now name the actual container and include the underlying Docker error output.
- The container dev server is now reused across requests. Previously the image was rebuilt and a fresh container started on every HTTP request (the result was missing the `persistent` flag); now a live container is kept and reused for the same service, matching how other persistent builders behave.
