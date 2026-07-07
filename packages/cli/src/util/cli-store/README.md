# Managed CLI Store (experimental)

Managed via the hidden `vc version` command. Opt in with
`vc version --experimental` (or `--binary` for the native payload); opt
out with `vc version reset`. The store's existence is the enrollment
signal — until someone enrolls, none of this changes behavior.
Env overrides: `VERCEL_CLI_STORE=0` bypasses per-invocation,
`VERCEL_CLI_STORE=1` forces on without enrollment (testing).

```
vc version                      status: running version + store state
vc version --experimental       enroll (track latest, npm payload)
vc version --binary             enroll/switch to the native payload
vc version pin <semver|latest|tarball-url> [--binary]
                                latest = tracking; semver/URL = pinned
vc version unpin                resume tracking from the pinned version
vc version list | ls            list store versions
vc version reset                remove the store entirely
```

A **pinned** pointer (`pinned: true` in `current.json`) is authoritative:
it wins the redirect even over a newer invoked version, the background
seeder never moves it, and only explicit `vc version` commands (which
write with force) change it. Tarball-URL pins skip integrity verification
(no registry metadata exists for them) and always pin.

A self-owned, versioned installation directory that decouples CLI upgrades
from package managers. Package managers keep acquisition (`npm i -g vercel`
works exactly as before); the store owns currency.

## Layout

```
~/.vercel/cli/                    (override: VERCEL_CLI_STORE_DIR)
├── versions/
│   ├── npm/<version>/            complete CLI + its own node_modules;
│   │                             write-once; integrity-verified from the
│   │                             npm registry; run via node
│   └── native/<version>/         standalone platform binary from
│                                 @vercel/vc-native-<platform>-<arch>;
│                                 integrity-verified; exec'd directly
├── current.json                  the pointer: { storeFormat, version, type }
│                                 (+ pinned?); atomic rename; monotonic
│                                 within a type unless forced by `vc version`
└── seed-attempt.json             background-seeding rate limiter
```

## Mechanisms

- **`vc upgrade`** downloads the target version's tarball directly from the
  registry, verifies it against the registry's published checksum, extracts
  it to a version directory, and flips the pointer. No package manager is
  invoked against the user's environment, and no install-method detection
  is performed. The success message reports the measured installed version.
  The payload type follows the pointer; switching types is a `vc version`
  act (`--binary`).
- **Redirect** (`src/store-redirect.mjs`): the entrypoint re-execs the
  store's version when it is strictly newer than the invoked install
  (`max(invoked, store)`). A fresh package-manager install of a newer
  version always wins immediately. Prerelease/dev builds never participate.
  A **native or pinned** pointer always wins regardless of version — both
  are explicit acts. Native payloads are exec'd directly (no second node
  startup).
- **Self-seeding**: when a running install is newer than the pointer, a
  detached background worker installs that version (from the registry,
  verified — never copied from local files) into the store. All eligible
  installs on a machine converge on the newest version anyone runs,
  without an explicit upgrade. Seeding never changes the payload type and
  never moves a pinned pointer.

## Eligibility: who participates

The crux of this work: the `vc`/`vercel` binaries on PATH are effectively
just pointers now — whatever version they shipped as, they run whatever
the store says is current. That's correct for global installs ("keep me
current") and wrong for lockfile-pinned project dependencies, where the
installed version is the answer. The eligibility check decides which kind
an install is.

Only installations in **known-global locations** are redirected or seed the
store (`isConfidentlyGlobal`), decided from two facts the process holds
exactly — no filesystem crawling or layout inference:

- under `PNPM_HOME` (pnpm globals, any layout generation), or
- under the running node's own global root, derived from
  `process.execPath` (npm-style managers: nvm, fnm, n, brew, system node).

Everything else — project dependencies, npx caches, unknown layouts — runs
exactly the version that was invoked. **Project installs are pinned-exact,
always**: redirecting them would break reproducibility and change builder
resolution, and no project can live under either global location, so no
classification bug can violate a pin. Known under-served layouts (volta,
custom npm `prefix=` configs, yarn-classic globals) keep today's behavior
until their location facts are added — additive, safe changes.

## Failure posture

Every failure in store code degrades to running the invoked install —
today's behavior. Unknown store formats or payload types read as "no
store" (forward compatibility). The pointer only moves up within a payload
type, so racing writers (seeder vs. upgrade) are harmless; type switches
and pin changes happen only through explicit `vc version` commands.

All store writes funnel through `installVersionToStore` /
`installNativeVersionToStore` / `installTarballUrlToStore`, called only
by `vc upgrade`, `vc version`, and the background seeder. The effective version is decided once, at
entrypoint time: a store write that lands while a command is running only
affects future invocations — no command ever observes the version changing
underneath it.

## Interactions to know about

- `pnpm ls -g vercel` reports the package-manager copy, which stops
  advancing once the store is ahead; `vc -v` reports the effective
  version. `--debug` prints whether the store was involved and which
  version ran.
- Per-invocation bypass: `VERCEL_CLI_STORE=0`. Unenroll: `vc version
reset` (removes the store; installs revert to package-manager managed).
- Auth and global config are untouched — every version reads the same
  `auth.json`/`config.json` from the existing global config directory.
- A running native binary install (`VERCEL_VC_NATIVE=1`) does not consult
  the store; store-managed native payloads are launched _by_ the node
  entrypoints. Making the native binary itself store-aware is follow-up
  work in its wrapper.
