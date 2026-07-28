---
'@vercel/container': minor
'@vercel/frameworks': minor
'@vercel/fs-detectors': patch
'@vercel/laravel': minor
'vercel': patch
---

Add an experimental zero-configuration Laravel framework integration backed by
Vercel Containers. Laravel apps now get automatic PHP and Composer resolution,
extension installation, Vite asset builds, stateless runtime defaults,
Services command overrides, and local `vercel dev` support without committing a
Dockerfile.
