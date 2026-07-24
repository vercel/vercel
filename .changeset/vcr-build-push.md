---
'vercel': minor
---

Add `vercel vcr build` and `vercel vcr push` to build and push container images to the Vercel Container Registry using your local engine (docker/podman/buildah). Both default the repository to the project name and the tag to `latest`, assemble the full registry reference for you, and forward any arguments after `--` to the engine. `vcr build --push` builds and pushes in one step with zstd compression enabled by default (Docker via Buildx, Podman/Buildah on push), and standalone `vcr push` compresses with zstd on Podman and Buildah.
