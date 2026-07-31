# Buildpack container builds

Services (and framework presets) for languages without a Lambda runtime are
built as OCI images with Cloud Native Buildpacks (Paketo). The CNB lifecycle
is language-agnostic; everything language-specific lives in one descriptor in
[`src/buildpacks/registry.ts`](src/buildpacks/registry.ts).

Buildpack builds are gated behind `VERCEL_RUBY_EXPERIMENTAL_BUILDPACK=1` while
the migration off per-language Lambda builders is in progress. With the flag
unset, Ruby services and the Ruby framework preset keep their legacy
`@vercel/ruby` behavior.

Ruby is the first registry entry. There is no Lambda path for buildpack
services; only framework-null `api/**/*.rb` functions continue to use
`@vercel/ruby`, and that path resolves through builds-and-routes detection,
not services.

## Adding a language

1. Add a `BuildpackDescriptor` to `BUILDPACKS` in
   `src/buildpacks/registry.ts`: runtime slug, framework slugs, project
   markers, digest-pinned builder + run images, and the buildpack group for
   the generated `order.toml`. (Paketo builders are per stack, not per
   language — `jammy-base` covers Ruby/Node/Go/Python; `jammy-full` adds
   PHP.)
2. Extend the `ServiceRuntime` union in `@vercel/build-utils` and, in
   `@vercel/fs-detectors`' `src/services/types.ts`, add the runtime to
   `BUILDPACK_RUNTIMES`, `RUNTIME_BUILDERS` (the legacy builder while the
   flag is off — buildpack runtimes are rerouted to `@vercel/container` when
   it is on; no new builder package is created), and `RUNTIME_MANIFESTS`
   (auto-detection markers, e.g. `pom.xml` for Java).
3. Optionally add a framework preset in `@vercel/frameworks`; builds-and-
   routes detection reroutes buildpack-backed presets to `@vercel/container`
   when the flag is on.
4. Add fixtures and tests.

No lifecycle, image-source, or resolver code should need to change.

## Selection and DX

- Services select a buildpack via `runtime` (e.g. `"ruby"`); the framework
  preset path selects it via the framework slug. Both channels resolve
  through `requestedBuildpack()`.
- A `Dockerfile.vercel` or `Containerfile.vercel` in the service root always
  takes precedence — it is the escape hatch from buildpacks. A conventional
  `Dockerfile` is ignored, so a repo can keep one for CI or local tooling
  without changing how Vercel builds it.
- Project markers (any-of, e.g. `Gemfile` for Ruby) are language evidence
  used only to fail fast with an actionable error; Paketo's own detect phase
  is authoritative during the build. List only files that phase requires —
  for Ruby, `bundle-install` fails without a `Gemfile`, so a `config.ru` or
  `Gemfile.lock` alone is not buildable. The framework preset's detectors
  mirror the same rules (`Gemfile` plus a `config.ru` or a supported server
  gem in `Gemfile.lock`).
- Detection runs against a generated `order.toml` containing only the
  descriptor's buildpack group, not the builder's full default order. A
  mixed-language root (say a `go.mod` next to a `Gemfile`) therefore always
  builds as the requested language.
- Neither `entrypoint` nor `command` is required. Paketo selects the default
  web process (e.g. from Rack/server gems for Ruby). `entrypoint` has no
  effect on buildpack services and is ignored with a warning.
- `command` in vercel.json is the Vercel-native process override. On deploy
  it is baked into the image as the default `web` process (via a Procfile
  copied into the build container on top of the app — the source tree is
  never mutated — so it runs through the CNB launcher with
  buildpack-provided env and lands in the image's OCI config, which is what
  production launches). In `vercel dev` it is applied at `docker run` time
  via `--entrypoint launcher`.
- A user-authored `Procfile` is **not** part of Vercel's configuration
  surface and is not a detection marker. Paketo's procfile buildpack does
  honor one if present (useful for Heroku migrations), but the documented
  override is `command`, which wins when both exist.
- Language versions come from the language's own manifests (e.g. `Gemfile`)
  or `BP_*` build env vars, delivered through the CNB platform dir
  (`/platform/env`).
- Descriptors may declare `defaultBuildEnv` — Heroku-style production
  defaults (Ruby: `RAILS_ENV=production`, `RACK_ENV=production`,
  `RAILS_LOG_TO_STDOUT=enabled`, `RAILS_SERVE_STATIC_FILES=enabled`) baked
  as launch-env defaults via Paketo's environment-variables buildpack
  (`BPE_DEFAULT_<KEY>`). A matching project env var is also copied to
  `BPE_<KEY>` so it overrides the default in the built image without requiring
  users to know Paketo's prefix. Unrelated build env remains build-only, and
  every applied default is logged.
  `SECRET_KEY_BASE` is deliberately not defaulted yet — see the TODO in the
  registry (per-deployment fallback plus a CLI prompt persisting a project
  env var, rather than hiding the secret in the build cache like Heroku).
- CNB `project.toml` semantics (env, include/exclude, custom groups) are
  currently ignored; custom builders and lifecycle extensions are
  unsupported.

## Builder images

Builder and run images are pinned by digest in the registry — deployments
run the builder on Vercel build infrastructure, so mutable tags would make
builds unreproducible and track unvetted upstream pushes. Bump digests
deliberately.

`VERCEL_BUILDPACK_<RUNTIME>_BUILDER` / `VERCEL_BUILDPACK_<RUNTIME>_RUN_IMAGE`
(tag or digest) override the pinned defaults — an internal escape hatch for
canarying a digest bump, unbreaking builds on a bad upstream image, or
pointing dev at a custom builder. Overrides are per language on purpose: a
generic variable would force one stack's builder onto every buildpack service
in a mixed-language project. When only the builder is overridden, the run
image comes from the builder's metadata; if it cannot be resolved, the build
fails rather than pairing the custom builder with the pinned default run
image.

## Local development

`vercel dev` invokes `/cnb/lifecycle/creator` in the builder through Docker
and exports the resulting app image to the active local daemon. Docker
Desktop context sockets are mounted into the builder when
`/var/run/docker.sock` is not the active socket.

## Deployments

The Vercel build image creates a temporary Buildah working container from
the trusted builder. The app is `buildah copy`ed into the container at
`/workspace` owned by the builder's build user (`CNB_USER_ID:CNB_GROUP_ID`) —
the environment pack provides and buildpacks are written against, so
workspace writes (bundler lockfile updates, rails-assets, npm lockfiles, …)
work for every language. Bind mounts are used only for read-only inputs
(order, platform env) and the report output. The lifecycle exports directly
to VCR using scoped `CNB_REGISTRY_AUTH` and the pinned run image, and
`report.toml` supplies the final digest returned in the build output.
Temporary Buildah containers, report dirs, order dirs, platform env dirs,
and Procfile dirs are removed on success and failure.

In `vercel dev` the workspace is still bind-mounted; on Linux dev hosts it
is not writable by the build user (macOS Docker Desktop mounts are
permissive). The planned fix mirrors pack's daemon flow: a named volume
populated by a root helper container (see the TODO on
`prepareAppDirectory`).
