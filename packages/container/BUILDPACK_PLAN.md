# Plan: Buildpack Support in `@vercel/container`

## Architecture (re-architected)

Buildpack builds use two completely separate code paths — **dev** and **cloud** —
because the two environments use fundamentally different container tooling:

### Dev path (`buildDevImage` in `lifecycle.ts`)

Runs on the developer's machine using **docker** or **podman**. These are
daemon-based engines where `docker run <image> <cmd>` creates a container from
an image and runs a command inside it in one step.

```
docker pull --platform $arch $builder
docker run --rm -v $staged:/workspace:ro -v $cache:/cache \
  [-v /var/run/docker.sock:/var/run/docker.sock]  (docker: -daemon mode) \
  [-v $layout:/layout]                            (podman: --layout mode) \
  -e CNB_PLATFORM_API=0.13 -e CNB_EXPERIMENTAL_MODE=warn \
  $builder /cnb/lifecycle/creator -app=/workspace -cache-dir=/cache \
  [-daemon | --layout --layout-dir=/layout] $tag
```

- **Docker**: creator `-daemon` writes the image directly to the Docker daemon
  via the mounted socket. No import step needed.
- **Podman**: creator `--layout` writes an OCI layout to a host tmpdir, then
  `podman pull oci:$dir` imports it. (macOS APFS can't bind-mount the podman
  socket into the AppleHV VM, so `-daemon` isn't available.)

### Cloud path (`buildAndPushCloudImage` in `lifecycle.ts`)

Runs in the Vercel build container using **buildah** (daemonless). Buildah's
`run` command takes a *working container* (created by `buildah from`), not an
image ref — this is the key difference from docker/podman that the previous
unified approach got wrong.

```
buildah pull --platform linux/amd64 $builder
ctr=$(buildah from --platform linux/amd64 $builder)
buildah run --network host \
  -v $staged:/workspace:ro -v $layout:/layout -v $cache:/cache \
  --env CNB_PLATFORM_API=0.13 --env CNB_EXPERIMENTAL_MODE=warn \
  $ctr -- /cnb/lifecycle/creator -app=/workspace -cache-dir=/cache \
  --layout --layout-dir=/layout $tag
buildah rm $ctr
buildah push [zstd flags] --digestfile $digestFile oci:$layout $imageRef
```

The OCI layout is pushed **directly** to the registry — no import into buildah's
store, no tagging step. This eliminates the entire import/tag/push dance that
the previous architecture required.

### Why two paths instead of one unified abstraction

The previous code tried to force docker/podman and buildah through a single
`buildWithLifecycle` function with an `OutputMode` enum. This caused:

1. **The buildah run bug** (PR review #3): `buildah run` was called with an
   image ref instead of a working container name. The unified code assumed
   `run <image> <cmd>` semantics (docker) but buildah requires
   `run <working-container> <cmd>`.
2. **Unnecessary complexity**: OutputMode enum, resolveOutputMode, docker.sock
   mounting for non-docker engines, import/tag/push dance for cloud.
3. **~526 lines of branched logic** instead of two clean ~100-line paths.

The two-path approach is simpler, correct by construction, and each path uses
its engine's native semantics.

### Shared helpers

Both paths share:
- `stageWorkspace()` — filtered copy of source (excludes node_modules, .git,
  .vercel, dist, etc.) to prevent host pnpm symlink contamination
- `envFlags()` — converts env maps to repeated `-e`/`--env` flags
- `NPM_WORKAROUND_ENV` — NPM_CONFIG_CACHE, BP_NPM_VERSION, COREPACK flags
- `CNB_ENV` — CNB_PLATFORM_API, CNB_EXPERIMENTAL_MODE
- `buildpackErrorHint()` — actionable error messages for common failures

---

## What We Proved (Exploration Findings)

### Works
- **`detect.ts` classification** — correctly routes: Dockerfile → docker build, OCI ref → prebuilt, `go.mod`/`Cargo.toml`/etc → buildpack, `package.json`/`requirements.txt` → passthrough (node/python have their own builders). `framework: "container"` or `project.toml` overrides to force buildpack.
- **Lifecycle/creator invocation** — no `pack` CLI needed. Builder image has `/cnb/lifecycle/creator` embedded.
- **Dev flow** — `resolveDevImage` in `dev.ts` calls `buildDevImage` → returns tag → `engine.devRun(tag)` launches container. Works with the existing port-discovery + env-file injection.

### Blockers Found (Must Fix Before Shipping)

| # | Blocker | Root Cause | Impact |
|---|---------|-----------|--------|
| B1 | **Paketo `npm-install 2.3.25` lru-cache bug** | `npm ci --cache /layers/.../npm-cache` triggers `cannot set sizeCalculation without setting maxSize or maxEntrySize` with npm ≥10.9 / Node ≥22. | Node.js projects can't build via buildpacks with current `builder-jammy-base:latest` |
| B2 | **No pnpm buildpack in `jammy-base`** | `builder-jammy-base` includes npm-install + yarn-install but **not** pnpm-install. | pnpm projects can't use buildpacks without a custom builder |
| B3 | **`builder-jammy-base:latest` is amd64-only on Docker Hub** | Published manifest is `linux/amd64` only. On Apple Silicon it runs via qemu (slow). | arm64 dev is functional but 5-10× slower. Cloud builds target `linux/amd64` so this is dev-only |

### Fixed in this re-architecture
- ~~B4: Cloud build path was stubbed/broken~~ → Fixed: `buildAndPushCloudImage` uses correct `buildah from` → `run` → `rm` → `push oci:$layout` sequence.
- ~~B5: OCI layout import tagging~~ → Eliminated: cloud pushes layout directly, no import/tag step.
- ~~B6: `-skip-restore` always on~~ → Fixed: dev uses `-skip-restore`, cloud omits it (enables layer cache restore).

### Review bugs fixed
- ~~#1: `/subuid|subgid|/i` regex matched any string~~ → Fixed: trailing empty alternative removed.
- ~~#2: Sticky failure catch-all~~ → Fixed: only container crash errors become sticky; transient failures (daemon down, build error, port timeout) are retried on next request.
- ~~#3: `buildah run` passed image ref instead of working container~~ → Fixed: `buildah from` creates working container, `buildah run` uses it.

---

## Plan: Ship Buildpack Support

### Phase 1: Fix the Node.js builder blocker (B1, B2)

**Goal:** Node.js projects can build via buildpacks with npm, yarn, and pnpm.

**Approach:** Build and publish a custom Vercel builder image based on Paketo, with:
- `npm-install` buildpack ≥ 2.4.x (fixes lru-cache bug)
- `pnpm-install` buildpack added
- Multi-arch (amd64 + arm64) manifest

**Steps:**
1. Create `packages/container/src/buildpacks/builder/` with a `builder.toml` that extends `paketobuildpacks/builder-jammy-base` and adds:
   - `paketo-buildpacks/pnpm-install` (latest)
   - `paketo-buildpacks/npm-install` ≥ 2.4.0
2. Build the custom builder via `pack builder create` (CI only) and publish to `ghcr.io/vercel/container-builder:latest`.
3. Update `manifest.ts` → `DEFAULT_BUILDER` to point at the Vercel builder.
4. `VERCEL_BUILDPACK_BUILDER` env override (already exists) for testing/custom builders.

### Phase 2: Per-runtime builder selection

**Goal:** `go.mod` projects use Paketo Go builder, `Cargo.toml` uses Rust builder, etc.

**Steps:**
1. Extend `detect.ts` to return a `builderHint` alongside `RuntimeFamily`.
2. Map source markers to builders:
   - `go.mod` → `paketobuildpacks/builder-jammy-tiny` (Go buildpack)
   - `Cargo.toml` → custom builder with Rust buildpack
   - `pom.xml` / `build.gradle` → `paketobuildpacks/builder-jammy-base` (Java)
   - `Gemfile` → `paketobuildpacks/builder-jammy-base` (Ruby)
   - `package.json` → Vercel custom builder (Phase 1)
3. `manifest.ts` → `builderImageRef()` accepts an optional runtime hint.

### Phase 3: Production hardening

**3a. Staging + ignore files**
- Respect `project.toml` `[build] exclude` list (CNB standard)
- Also respect `.vercelignore` if present
- Replace hardcoded `STAGE_EXCLUDES` with a merged ignore list

**3b. Layer cache persistence (cloud)**
- Cloud: use `creator -cache-image=$registry/cache:$tag` to push cache layers to registry
- Dev: keep named volume `vercel-bp-cache-$service` (already works)

**3c. Tests**
- Unit test `detect.ts` with all runtime markers (already have some)
- Integration test: build a simple Go project via buildpacks in dev (no Dockerfile)
- Cloud buildpack test: verify buildah from → run → rm → push sequence (added in this PR)

---

## Branch Strategy

- **`bluff-horned-toad-v2`** — exploration + re-architecture branch. PR #17006.
- **Future**: branch from `main`, cherry-pick the stable parts:
  - `detect.ts` (classification logic — clean, tested)
  - `manifest.ts` (builder ref — update default after Phase 1)
  - `lifecycle.ts` (re-architected: `buildDevImage` + `buildAndPushCloudImage`)
  - `dev.ts` changes (buildpack dev path wiring)
  - `index.ts` changes (buildpack cloud path)
  - `test/unit.test.ts` (buildpack detection + cloud path tests)
- **Do NOT cherry-pick** the podman-private vendoring (engines/podman/*) — that's parked.

## Changeset

- Re-architecture: `'@vercel/container': patch` — "Split buildpack lifecycle into separate dev (docker/podman) and cloud (buildah) paths; fix buildah run bug, sticky failure catch-all, and subuid/subgid regex"

## Open Questions

1. **Custom builder image hosting** — ghcr.io/vercel/* or VCR? VCR requires OIDC auth; ghcr.io is public and cacheable.
2. **Should `framework: "container"` be the only opt-in, or should we auto-detect `go.mod` etc.?** — `detect.ts` already auto-detects, but CLI resolver routing needs checking.
3. **Node.js via buildpacks vs `@vercel/node`** — we exclude `package.json` from buildpack auto-detection. If user explicitly sets `framework: container` on a Node project, should we build via buildpacks or hand off to `@vercel/node`? Current: `framework: container` → buildpack.
