---
'@vercel/container': minor
'@vercel/fs-detectors': minor
'@vercel/frameworks': patch
'@vercel/build-utils': patch
'vercel': patch
---

Add generic Cloud Native Buildpack container builds, with Ruby as the first
supported language, gated behind `VERCEL_RUBY_EXPERIMENTAL_BUILDPACK=1`.

`@vercel/container` gains a language-agnostic CNB lifecycle driven by a
per-language descriptor registry (`src/buildpacks/registry.ts`). Adding a
follow-up language (PHP, Java, …) means a registry entry (runtime slug,
project markers, digest-pinned builder/run images, buildpack group), an
fs-detectors `BUILDPACK_RUNTIMES` entry, and optionally a framework preset.
Detection runs against a generated `order.toml` scoped to the descriptor's
buildpack group, so mixed-language roots always build as the requested
language.

With the flag set, zero-config detection of the Ruby framework works without
`VERCEL_USE_EXPERIMENTAL_FRAMEWORKS`, and its detectors mirror what the
Paketo Ruby buildpack can build: a `Gemfile` plus a `config.ru` or a
supported server gem (puma/thin/unicorn/passenger/rack) in `Gemfile.lock`.
Ruby services use `runtime: "ruby"` and require neither
`entrypoint` nor `command` (`entrypoint` is ignored with a warning); versions
come from `Gemfile` or `BP_MRI_VERSION` (delivered via the CNB platform
dir). On deploy the app is copied into the build container owned by the
builder's build user (as `pack` does), so buildpacks can write to the
workspace (bundler lockfile self-healing, asset compilation). Ruby builds
bake Heroku-style production defaults into the image
(`RAILS_ENV`/`RACK_ENV=production`, `RAILS_LOG_TO_STDOUT`/
`RAILS_SERVE_STATIC_FILES=enabled` — Paketo's rails-assets buildpack shadows
the latter two with `=true` for Rails apps) — each applied default is
logged, and project build env wins (`RACK_ENV` is automatically embedded as
the `BPE_RACK_ENV` launch override). Deployment-level runtime env vars
are injected into container-image functions and override baked values,
except where the app server reassigns them at boot (puma rewrites
`ENV['RACK_ENV']` from its `environment` directive). A `command`
override is baked into the image as its default `web` process via a Procfile
copied on top of the app — the source tree is never mutated — so production
(which launches the image's OCI config) and `vercel dev` (which execs via
the CNB launcher) behave identically. Projects with `framework: "ruby"` also switch
from the `@vercel/ruby` Lambda builder to container builds. A
`Dockerfile.vercel`/`Containerfile.vercel` marker opts a service out of
buildpacks; a conventional `Dockerfile` does not.

Without the flag, Ruby keeps its legacy `@vercel/ruby` behavior everywhere.
There is no Lambda path for buildpack services; framework-null `api/**/*.rb`
functions continue to use `@vercel/ruby` regardless of the flag.
