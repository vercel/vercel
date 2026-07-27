---
'@vercel/container': minor
'@vercel/fs-detectors': minor
'@vercel/frameworks': patch
'@vercel/build-utils': patch
'vercel': patch
---

Add generic Cloud Native Buildpack container builds, with Ruby as the first
supported language, gated behind `VERCEL_EXPERIMENTAL_BUILDPACKS=1`.

`@vercel/container` gains a language-agnostic CNB lifecycle driven by a
per-language descriptor registry (`src/buildpacks/registry.ts`). Adding a
follow-up language (PHP, Java, …) means a registry entry (runtime slug,
project markers, digest-pinned builder/run images, buildpack group), an
fs-detectors `BUILDPACK_RUNTIMES` entry, and optionally a framework preset.
Detection runs against a generated `order.toml` scoped to the descriptor's
buildpack group, so mixed-language roots always build as the requested
language.

With the flag set, Ruby services use `runtime: "ruby"` and require neither
`entrypoint` nor `command` (`entrypoint` is ignored with a warning); versions
come from `Gemfile` or `BP_MRI_VERSION` (delivered via the CNB platform
dir). A `command` override is baked into the image as its default `web`
process via a Procfile written to a staged app copy, so production (which
launches the image's OCI config) and `vercel dev` (which execs via the CNB
launcher) behave identically. Projects with `framework: "ruby"` also switch
from the `@vercel/ruby` Lambda builder to container builds. A
`Dockerfile.vercel`/`Containerfile.vercel` marker opts a service out of
buildpacks; a conventional `Dockerfile` does not.

Without the flag, Ruby keeps its legacy `@vercel/ruby` behavior everywhere.
There is no Lambda path for buildpack services; framework-null `api/**/*.rb`
functions continue to use `@vercel/ruby` regardless of the flag.
