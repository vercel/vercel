---
"@vercel/build-utils": patch
"vercel": patch
---

Apply per-service `functions` config when building experimental V2 services. Previously, function configuration declared under `services.<name>.functions` in `vercel.json` (`experimentalTriggers`, `maxDuration`, `memory`, `architecture`, `regions`, `functionFailoverRegions`, `supportsCancellation`) was dropped at build time — only the top-level `functions` map was honored. The build now feeds each service's `functions` to its lambdas for both single-lambda builders (`@vercel/node`, etc., via `writeBuildResultV3`) and framework builders that read `config.functions` (e.g. `@vercel/next`, via the builder config). Derived `queue/v2beta` consumer groups are now scoped by the owning service name so two services that declare the same function path + topic no longer collide.
