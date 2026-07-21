---
'@vercel/container': minor
'@vercel/fs-detectors': minor
'@vercel/frameworks': patch
'@vercel/build-utils': patch
'vercel': patch
---

Add generic Cloud Native Buildpack container builds, with Ruby as the first
supported language.

`@vercel/container` gains a language-agnostic CNB lifecycle driven by a
per-language descriptor registry (`src/buildpacks/registry.ts`); follow-up
languages (PHP, Java, …) only add a registry entry plus an fs-detectors
`BUILDPACK_RUNTIMES` entry. Builder and run images are pinned by digest.

Ruby Services use `runtime: "ruby"` and require neither `entrypoint` nor
`command`; versions come from `Gemfile` or `BP_MRI_VERSION` (delivered via
the CNB platform dir). A `command` override is baked into the image as its
default `web` process so production (which launches the image's OCI config)
and `vercel dev` (which execs via the CNB launcher) behave identically.
Projects with `framework: "ruby"` also switch from the `@vercel/ruby` Lambda
builder to container builds. There is no Lambda path for buildpack services;
only framework-null `api/**/*.rb` functions continue to use `@vercel/ruby`.
