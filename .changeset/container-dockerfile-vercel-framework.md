---
'@vercel/frameworks': minor
'@vercel/container': patch
---

Support deploying any project as a container via a `Dockerfile.vercel` or `Containerfile.vercel` marker. A new experimental `container` framework preset detects these files and is listed first so it takes precedence over all other frameworks — a project that also looks like (e.g.) a Next.js app will deploy as a container when one of these markers is present. As an experimental framework it is gated behind `VERCEL_USE_EXPERIMENTAL_FRAMEWORKS`. The `@vercel/container` builder now recognizes the `.vercel` markers, auto-discovers them when its entrypoint is `<detect>`, and supports root (non-service) container deploys.
