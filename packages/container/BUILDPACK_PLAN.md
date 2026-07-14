# Plan: Buildpack Support in `@vercel/container`

## Context

This branch (`bluff-horned-toad-v2`) is an **exploration branch** that proved two things:

1. **Rootless container dev** — vendored Podman runtime works with `vercel dev` via `selectDevEngine` (docker → podman → podman-private). Users can run containers locally without Docker Desktop or elevated permissions. *This is validated and parked — we'll assume users bring their own Docker/Podman for now.*

2. **Buildpack OCI image builds** — `lifecycle/creator` inside a Paketo builder image can build source into OCI images without a Dockerfile. The `detect.ts` → `lifecycle.ts` → `engine.devRun` pipeline works end-to-end for dev. *This is the immediate need to productionize.*

This document is the plan for shipping #2 as a real feature in `@vercel/container`.

---

## What We Proved (Exploration Findings)

### Works
- **`detect.ts` classification** — correctly routes: Dockerfile → docker build, OCI ref → prebuilt, `go.mod`/`Cargo.toml`/etc → buildpack, `package.json`/`requirements.txt` → passthrough (node/python have their own builders). `framework: "container"` or `project.toml` overrides to force buildpack.
- **Lifecycle/creator invocation** — no `pack` CLI needed. Builder image has `/cnb/lifecycle/creator` embedded. We `engine run --rm builder /cnb/lifecycle/creator -app=/workspace -cache-dir=/cache -skip-restore $tag`.
- **OCI layout export for Podman** — macOS APFS can't bind-mount `$TMPDIR/podman.sock` into AppleHV VM (`statfs: operation not supported`). Solution: `creator --layout --layout-dir=/layout` writes OCI image to a host tmpdir, then `podman pull oci:$dir` imports it. Requires `CNB_EXPERIMENTAL_MODE=warn`.
- **Docker daemon export** — `creator -daemon` + mount `/var/run/docker.sock` writes image directly to Docker's image store.
- **Staging copy** — excluding `node_modules`, `dist`, `.git`, `.vercel` from the bind-mounted workspace prevents host pnpm symlink contamination that breaks Paketo's npm-install ("Cannot read properties of null (reading isDescendantOf)").
- **Required env flags** — `CNB_PLATFORM_API=0.13` (lifecycle ≥0.14 requirement), `CNB_EXPERIMENTAL_MODE=warn` (for `--layout`).
- **Dev flow** — `resolveDevImage` in `dev.ts` calls `buildWithLifecycle` → returns tag → `engine.devRun(tag)` launches container. Works with the existing port-discovery + env-file injection.

### Blockers Found (Must Fix Before Shipping)

| # | Blocker | Root Cause | Impact |
|---|---------|-----------|--------|
| B1 | **Paketo `npm-install 2.3.25` lru-cache bug** | `npm ci --cache /layers/.../npm-cache` triggers `cannot set sizeCalculation without setting maxSize or maxEntrySize` with npm ≥10.9 / Node ≥22. Buildpack hardcodes `--cache` flag, so `NPM_CONFIG_CACHE` env is ignored. `BP_NPM_VERSION` doesn't fix it — bug is in cacache's lru-cache, not npm itself. | Node.js projects can't build via buildpacks with current `builder-jammy-base:latest` |
| B2 | **No pnpm buildpack in `jammy-base`** | `builder-jammy-base` includes npm-install + yarn-install but **not** pnpm-install. `jammy-full` also lacks it. | pnpm projects (like `podman-test`) can't use buildpacks without a custom builder |
| B3 | **`builder-jammy-base:latest` is amd64-only on Docker Hub** | Despite docs saying multi-arch, the published manifest is `linux/amd64` only. On Apple Silicon it runs via qemu (slow, ~5s for node install vs <1s native). | arm64 dev is functional but 5-10× slower. Cloud builds target `linux/amd64` so this is dev-only impact |
| B4 | **Cloud build path (`buildViaBuildpackAndPush`) is stubbed** | `index.ts` has a separate `buildViaBuildpackAndPush` that uses `buildah run` directly with a simplified creator invocation. It doesn't share `buildWithLifecycle`, doesn't handle staging, env flags, or the layout/daemon split. | Cloud buildpack builds would fail or produce wrong images |
| B5 | **OCI layout import tagging** | `podman pull oci:$dir` imports the image but the tag may not match `params.tag` — creator writes its own ref into `index.json`. Current code does `podman tag params.tag params.tag` as a no-op. | Image may exist under wrong ref, `devRun` can't find it |
| B6 | **`-skip-restore` is always on** | Fine for dev (no previous image). Cloud builds want layer cache restore for incremental builds. | Cloud buildpack builds can't reuse cached layers across deployments |

---

## Plan: Ship Buildpack Support

### Phase 1: Fix the Node.js builder blocker (B1, B2)

**Goal:** Node.js projects can build via buildpacks with npm, yarn, and pnpm.

**Approach:** Build and publish a custom Vercel builder image based on Paketo, with:
- `npm-install` buildpack ≥ 2.4.x (fixes lru-cache bug)
- `pnpm-install` buildpack added
- Multi-arch (amd64 + arm64) manifest

This is the **highest-leverage** approach because:
- We control the builder image (pinned versions, security patches)
- We can add Vercel-specific buildpacks later (e.g. a `vercel-start` buildpack that reads `vercel.json` for `command`)
- Users don't need to install `pack` — we still just `engine run builder /cnb/lifecycle/creator`

**Steps:**
1. Create `packages/container/src/buildpacks/builder/` with a `builder.toml` that extends `paketobuildpacks/builder-jammy-base` and adds:
   - `paketo-buildpacks/pnpm-install` (latest)
   - `paketo-buildpacks/npm-install` ≥ 2.4.0
   - Any Vercel-specific buildpacks (future)
2. Build the custom builder via `pack builder create` (CI only, not on user machines) and publish to `ghcr.io/vercel/container-builder:latest` (or VCR).
3. Update `manifest.ts` → `DEFAULT_BUILDER` to point at the Vercel builder.
4. Add `VERCEL_BUILDPACK_BUILDER` env override (already exists) for testing/custom builders.

**Alternative (if we don't want to maintain a builder image):**
- Use `paketobuildpacks/builder-jammy-full:latest` (has all buildpacks but still has the npm-install bug)
- Pin Node version to `<22` via `BP_NODE_VERSION=20.18.0` (npm 10.8.x doesn't have the lru-cache bug)
- This is a workaround, not a fix — Node 20 is approaching EOL

**Recommendation:** Custom builder. It's a one-time CI setup that unblocks everything and gives us control.

### Phase 2: Unify dev + cloud build paths (B4)

**Goal:** `buildWithLifecycle` is the single source of truth for both dev and cloud buildpack builds.

**Steps:**
1. **Refactor `buildWithLifecycle`** to accept an `outputMode: 'daemon' | 'layout' | 'registry'` param:
   - `daemon` — mount docker.sock, `creator -daemon` (current Docker dev path)
   - `layout` — `creator --layout`, then `podman pull oci:` (current Podman dev path)
   - `registry` — `creator -daemon` with registry auth pre-configured, then `engine.push` (cloud path)
2. **Replace `buildViaBuildpackAndPush`** in `index.ts` to call `buildWithLifecycle({ outputMode: 'registry', ... })` instead of the current `buildah run` stub.
3. **Add staging to cloud path** — cloud builds also need the filtered workspace copy (exclude node_modules etc.) so the build container sees clean source. Currently staging only runs in `lifecycle.ts` for dev.
4. **Make `-skip-restore` conditional** — off for cloud (enables layer cache reuse), on for dev first-build.

### Phase 3: Per-runtime builder selection

**Goal:** `go.mod` projects use Paketo Go builder, `Cargo.toml` uses Rust builder, etc.

**Steps:**
1. Extend `detect.ts` to return a `builderHint` alongside `RuntimeFamily`:
   ```ts
   export interface DetectResult {
     family: RuntimeFamily;
     builder?: string; // e.g. 'paketobuildpacks/builder-jammy-tiny' for Go
   }
   ```
2. Map source markers to builders:
   - `go.mod` → `paketobuildpacks/builder-jammy-tiny` (Go buildpack)
   - `Cargo.toml` → custom builder with Rust buildpack (Paketo doesn't have a base Rust builder)
   - `pom.xml` / `build.gradle` → `paketobuildpacks/builder-jammy-base` (Java buildpacks included)
   - `Gemfile` → `paketobuildpacks/builder-jammy-base` (Ruby included)
   - `package.json` → Vercel custom builder (Phase 1)
3. `manifest.ts` → `builderImageRef()` accepts an optional runtime hint and returns the right builder.

### Phase 4: Production hardening

**Goal:** Buildpack builds are reliable, cacheable, and produce good error messages.

**4a. Staging + ignore files**
- Respect `project.toml` `[build] exclude` list (CNB standard)
- Also respect `.vercelignore` if present (Vercel convention)
- Replace hardcoded `STAGE_EXCLUDES` with a merged ignore list
- For large repos, use tar+pipe instead of `cpSync` (avoids copying huge dirs)

**4b. Layer cache persistence (cloud)**
- Cloud: use `creator -cache-image=$registry/cache:$tag` to push cache layers to registry
- Next build: `creator -cache-image=$registry/cache:$tag -previous-image=$registry/app:$tag` for restore
- Dev: keep named volume `vercel-bp-cache-$service` (already works)

**4c. OCI layout import fix (B5)**
- After `podman pull oci:$dir`, inspect the imported image ID
- `podman tag $imageId $params.tag` (not `podman tag $tag $tag` which is a no-op)
- Or: use `skopeo copy oci:$dir containers-storage:$params.tag` which tags correctly

**4d. Error messages**
- Detect common failure modes and provide actionable hints (already partially done in `lifecycle.ts` catch block)
- Add detection for: "no buildpack matched" → suggest adding `project.toml` or `BP_*` env
- Add detection for: "npm ci failed" → suggest pinning Node version or using custom builder

**4e. Tests**
- Unit test `detect.ts` with all runtime markers (already have some in `unit.test.ts`)
- Integration test: build a simple Go project via buildpacks in dev (no Dockerfile)
- Integration test: build a Node project via buildpacks in dev (after Phase 1 builder fix)
- Test staging copy excludes correctly
- Test OCI layout import produces the expected tag

---

## Branch Strategy

- **`bluff-horned-toad-v2`** — stays as the exploration/discovery branch. No cleanup needed. PR #17006 remains open as WIP.
- **New branch** (e.g. `container-buildpacks`) — branched from `main`, cherry-pick the stable parts from exploration:
  - `packages/container/src/buildpacks/detect.ts` (classification logic — clean, tested)
  - `packages/container/src/buildpacks/manifest.ts` (builder ref — update default after Phase 1)
  - `packages/container/src/buildpacks/lifecycle.ts` (creator invocation — needs Phase 2 refactor)
  - `packages/container/src/buildpacks/index.ts` (exports)
  - `packages/container/src/dev.ts` changes (buildpack dev path wiring)
  - `packages/container/src/index.ts` changes (buildpack cloud path — needs Phase 2 refactor)
  - `packages/container/test/unit.test.ts` (buildpack detection tests)
- **Do NOT cherry-pick** the podman-private vendoring (engines/podman/*) — that's discovery #1, parked.

## Changeset

Each phase gets its own changeset:
- Phase 1: `'@vercel/container': minor` — "Add buildpack support for Node.js projects via custom Paketo builder"
- Phase 2: `'@vercel/container': patch` — "Unify dev and cloud buildpack build paths through buildWithLifecycle"
- Phase 3: `'@vercel/container': minor` — "Auto-select Paketo builder per runtime (Go, Rust, Java, Ruby)"
- Phase 4: `'@vercel/container': patch` — "Production hardening: cache persistence, staging ignores, error messages"

## Open Questions

1. **Custom builder image hosting** — ghcr.io/vercel/* or VCR (Vercel Container Registry)? VCR requires OIDC auth which is already wired but adds a pull dependency for every build. ghcr.io is public and cacheable.
2. **Should we vendor `pack` CLI as a fallback?** — `lifecycle/creator` inside the builder works without `pack`, but `pack` provides better error messages and buildpack debugging. Probably not — keep zero-host-binary invariant.
3. **Should `framework: "container"` be the only opt-in, or should we auto-detect `go.mod` etc.?** — `detect.ts` already auto-detects `go.mod`/`Cargo.toml` without `framework: container`, but the CLI resolver may not route those projects to `@vercel/container` unless the user explicitly sets `framework: container`. Need to check `@vercel/fs-detectors` routing.
4. **Node.js via buildpacks vs `@vercel/node`** — we explicitly exclude `package.json` from buildpack auto-detection (passthrough). But if a user explicitly sets `framework: container` on a Node project, should we build it via buildpacks or hand off to `@vercel/node`? Current behavior: `framework: container` → buildpack. This is correct for the "I want a container but don't want to write a Dockerfile" use case.
