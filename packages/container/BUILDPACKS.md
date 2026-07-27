# Buildpack container builds

Services (and framework presets) for languages without a Lambda runtime are
built as OCI images with Cloud Native Buildpacks (Paketo). The CNB lifecycle
is language-agnostic; everything language-specific lives in one descriptor in
[`src/buildpacks/registry.ts`](src/buildpacks/registry.ts).

Ruby is the first registry entry. There is no Lambda path for buildpack
services; only framework-null `api/**/*.rb` functions continue to use
`@vercel/ruby`, and that path resolves through builds-and-routes detection,
not services.

## Adding a language

1. Add a `BuildpackDescriptor` to `BUILDPACKS` in
   `src/buildpacks/registry.ts`: runtime slug, framework slugs, project
   markers, and digest-pinned builder + run images. (Paketo builders are per
   stack, not per language — `jammy-base` covers Ruby/Node/Go/Python;
   `jammy-full` adds PHP.)
2. Extend the `ServiceRuntime` union in `@vercel/build-utils` and, in
   `@vercel/fs-detectors`' `src/services/types.ts`, add the runtime to
   `BUILDPACK_RUNTIMES`, `RUNTIME_BUILDERS` (buildpack runtimes map to
   `@vercel/container` — no new builder package is created), and
   `RUNTIME_MANIFESTS` (auto-detection markers, e.g. `pom.xml` for Java).
3. Optionally add a framework preset in `@vercel/frameworks` pointing at
   `@vercel/container` with the `<detect>` sentinel.
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
- Project markers (e.g. `Gemfile`, `config.ru` for Ruby) are language
  evidence used only to fail fast with an actionable error; Paketo's own
  detect phase is authoritative during the build.
- Neither `entrypoint` nor `command` is required. Paketo selects the default
  web process (e.g. from Rack/server gems for Ruby).
- `command` in vercel.json is the Vercel-native process override. On deploy
  it is baked into the image as the default `web` process (via a generated
  Procfile, so it runs through the CNB launcher with buildpack-provided
  env and lands in the image's OCI config — which is what production
  launches). In `vercel dev` it is applied at `docker run` time via
  `--entrypoint launcher`.
- A user-authored `Procfile` is **not** part of Vercel's configuration
  surface and is not a detection marker. Paketo's procfile buildpack does
  honor one if present (useful for Heroku migrations), but the documented
  override is `command`, which wins when both exist.
- Language versions come from the language's own manifests (e.g. `Gemfile`)
  or `BP_*` build env vars, delivered through the CNB platform dir
  (`/platform/env`).

## Builder images

Builder and run images are pinned by digest in the registry — deployments
run the builder on Vercel build infrastructure, so mutable tags would make
builds unreproducible and track unvetted upstream pushes. Bump digests
deliberately.

`VERCEL_BUILDPACK_<RUNTIME>_BUILDER` / `VERCEL_BUILDPACK_<RUNTIME>_RUN_IMAGE`
(tag or digest) override the pinned defaults — the escape hatch for canarying
a digest bump, unbreaking builds on a bad upstream image, or pointing dev at
a custom builder. Overrides are per language on purpose: a generic variable
would force one stack's builder onto every buildpack service in a
mixed-language project. When only the builder is overridden, the run image
follows the builder's metadata instead of the pinned default.

## Local development

`vercel dev` invokes `/cnb/lifecycle/creator` in the builder through Docker
and exports the resulting app image to the active local daemon. Docker
Desktop context sockets are mounted into the builder when
`/var/run/docker.sock` is not the active socket.

## Deployments

The Vercel build image creates a temporary Buildah working container from
the trusted builder. The lifecycle exports directly to VCR using scoped
`CNB_REGISTRY_AUTH` and the pinned run image, and `report.toml` supplies the
final digest returned in the build output. Temporary Buildah containers,
report dirs, and platform env dirs are removed on success and failure.
