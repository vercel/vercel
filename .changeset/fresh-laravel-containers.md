---
'@vercel/container': minor
'@vercel/frameworks': minor
'@vercel/fs-detectors': patch
'@vercel/laravel': minor
'vercel': patch
---

Add an experimental zero-configuration Laravel framework integration backed by
Vercel Containers. Laravel apps now get automatic PHP and Composer resolution,
a digest-pinned prebuilt PHP 8.5 image (with source-build fallbacks), Vite asset
builds with automatic Laravel Wayfinder generation, stateless runtime defaults,
declared package-manager version support, Services command overrides, and local
`vercel dev` support without committing a Dockerfile. The runtime bundles
Laravel-native Blob, Queues, and broadcasting adapters without an application
dependency. Deploys provision private Blob storage when needed and emit private
`queue/v2beta` consumers that execute jobs through Laravel's native worker.
Services also accept qualified prebuilt OCI image entrypoints, avoiding a
source container rebuild for companion services during fresh deployments.
