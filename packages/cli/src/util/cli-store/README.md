# Managed CLI Store (experimental)

Enabled with `VERCEL_CLI_STORE=1`. Without the flag, none of this code runs.

A self-owned, versioned installation directory that decouples CLI upgrades
from package managers. Package managers keep acquisition (`npm i -g vercel`
works exactly as before); the store owns currency.

## Layout

```
~/.vercel/cli/                    (override: VERCEL_CLI_STORE_DIR)
├── versions/
│   └── npm/<version>/            complete CLI + its own node_modules;
│                                 write-once; integrity-verified from the
│                                 npm registry ("npm/" namespace reserves a
│                                 "native/" lane for the binary payload)
├── current.json                  the pointer: { storeFormat, version, type }
│                                 atomic rename; monotonic (never moves down)
└── seed-attempt.json             background-seeding rate limiter
```

## Mechanisms

- **`vc upgrade`** downloads the target version's tarball directly from the
  registry, verifies it against the registry's published checksum, extracts
  it to a version directory, installs its runtime dependencies scoped to
  that directory, and flips the pointer. No package manager is invoked
  against the user's environment, and no install-method detection is
  performed. The success message reports the measured installed version.
- **Redirect** (`src/store-redirect.mjs`): the entrypoint re-execs the
  store's version when it is strictly newer than the invoked install
  (`max(invoked, store)`). A fresh package-manager install of a newer
  version always wins immediately. Prerelease/dev builds never participate.
- **Self-seeding**: when a running install is newer than the pointer, a
  detached background worker installs that version (from the registry,
  verified — never copied from local files) into the store. With this, all
  eligible installs on a machine converge on the newest version anyone
  runs, without an explicit upgrade.

## Eligibility: who participates

The crux of this work: the `vc`/`vercel` binaries on PATH are effectively
just pointers now — whatever version they shipped as, they run whatever
the store says is current. That's correct for global installs ("keep me
current") and wrong for lockfile-pinned project dependencies, where the
installed version is the answer. The eligibility check decides which kind
an install is.

Only installations we can **confidently classify as global** are redirected
or seed the store (`isConfidentlyGlobal`):

- anything under `PNPM_HOME` (pnpm globals, any layout generation), or
- under a `node_modules` with **no lockfile in any ancestor directory**
  (npm/yarn-classic globals — npm never writes lockfiles for globals).

Everything else — project dependencies, and anything ambiguous — runs
exactly the version that was invoked. **Project installs are
lockfile-exact, always**: redirecting them would break build
reproducibility and change builder resolution. The check is deliberately
asymmetric: a false negative merely keeps an install on today's
package-manager-managed behavior, while a false positive on a project
install would violate its lockfile — so all doubt resolves to "not
global". Unrecognized global layouts can be added to the confident set
over time; each addition is safe and additive.

## Failure posture

Every failure in store code degrades to running the invoked install —
today's behavior. Unknown store formats or payload types read as "no
store" (forward compatibility for the future native payload). The pointer
only moves up, so racing writers (seeder vs. upgrade) are harmless.

All store writes funnel through one path (`installVersionToStore`), with
exactly two callers: `vc upgrade` and the background seeder. And the
effective version is decided once, at entrypoint time: a store write that
lands while a command is running only affects future invocations — no
command ever observes the version changing underneath it.

## Interactions to know about

- `pnpm ls -g vercel` reports the package-manager copy, which stops
  advancing once the store is ahead; `vc -v` reports the effective
  version. `--debug` prints whether the store was involved and which
  version ran.
- Per-invocation bypass: unset `VERCEL_CLI_STORE` (or any value ≠ `1`).
  Full reset: delete `~/.vercel/cli`.
- Auth and global config are untouched — every version reads the same
  `auth.json`/`config.json` from the existing global config directory.
- Native binary installs (`VERCEL_VC_NATIVE=1`) are excluded until the
  store supports a native payload type.
