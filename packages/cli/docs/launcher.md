# Launcher

`dist/vc.js` is the `vercel` bin. It maps the current platform to one package
and runs it. Native is the default; see [Opting out](#opting-out-of-the-native-binary)
for the escape hatch this release keeps.

| Platform                                        | Package                        | How it runs        |
| ----------------------------------------------- | ------------------------------ | ------------------ |
| `darwin-x64`, `darwin-arm64`                    | `@vercel/vc-native-<platform>` | Spawns the binary  |
| `linux-x64`, `linux-arm64` (glibc and musl)     | `@vercel/vc-native-<platform>` | Spawns the binary  |
| `win32` (every arch), every other platform/arch | `@vercel/cli-support`          | Imports its JS CLI |

The packages are optional dependencies of `vercel`, so the package manager
installs only the one that matches. On Linux the launcher checks `ldd --version`
to choose between the glibc and musl packages, because Yarn classic installs
both. Windows runs only the Node.js CLI until its native binaries are signed;
`@vercel/vc-native-win32-*` are still published but are not dependencies of
`vercel`.

The launcher looks for packages only in its own install's `node_modules`
ancestors, never through `NODE_PATH` or the global folders.

## Downloading a missing native binary

Some installs skip optional dependencies (`--omit=optional`, a lockfile created
on another platform, an install made before npm served the native package).
When the native package for a native platform is missing, the launcher
downloads the binary for its own exact version instead of falling back:

1. It looks in the CLI cache first:
   `<cache>/native/<version>/<platform>/vercel`, where `<cache>` is the
   `com.vercel.cli` cache directory (`~/Library/Caches/com.vercel.cli` on
   macOS, `$XDG_CACHE_HOME/com.vercel.cli` or `~/.cache/com.vercel.cli` on
   Linux). It never writes into `node_modules`.
2. Otherwise it fetches the metadata for
   `@vercel/vc-native-<platform>@<version>` from `registry.npmjs.org`,
   downloads the tarball, and checks it against the registry's sha512
   `integrity` before extracting only `package/bin/vercel`. `HTTPS_PROXY`,
   `NO_PROXY`, and `NODE_EXTRA_CA_CERTS` are honored.
3. It runs the binary with `--version` to make sure it starts on this machine,
   then renames it into place. Concurrent launches each use their own
   temporary files, and the rename is atomic, so a partial binary is never
   visible. Temporary files left by a killed launch are removed once they are
   10 minutes old. Old version directories are not pruned.

It prints `Downloading the Vercel CLI binary for <platform>…` on stderr, and
the bytes received every 30 seconds, except with `--json`. The download gives
up after 30 seconds without data or 5 minutes in total.

It downloads whenever the binary is needed, including for `--version` and
`--help`: once `vercel` ships without its JS CLI, only the binary can answer
them. After the first download they work offline. It never downloads for
`@vercel/cli-support`, which the build container runs on Linux, for a user who
opted out of the native binary, or for a launcher outside `node_modules` (a
repository checkout), which runs its own JS CLI so local changes and tests
never run a published binary.

If the cache directory can't be created or written, the launcher runs this
package's JS CLI without trying (`target_missing`). If the download fails, the
launcher warns, runs this package's JS CLI (`download_failed`), and doesn't try
again for 24 hours. The 24-hour wait relies on that JS CLI and has to be
revisited when `vercel` ships without it.

The download is for npm releases, which publish a native package for every
version. Builds without one, such as PR preview tarballs (prerelease versions
like `65.4.0-<sha>`), get an HTTP 404, warn once a day, and run this package's
JS CLI.

## Falling back to this package's JS CLI

`vercel` still ships its own JS CLI (`dist/index.js`). The launcher runs it only
when:

- the mapped package is `@vercel/cli-support` and it is not installed
  (`target_missing`),
- the native binary is missing and couldn't be downloaded
  (`download_failed`),
- the native binary cannot be started at all (`ENOENT`, `EACCES`, `ENOEXEC`).
  The launcher prints a notice first, or
- the user opted out of the native binary (`opt_out`).

Once the native binary starts, its exit status or signal is passed through. A
failed command is never retried in Node.js, because a loader failure (such as a
glibc mismatch) can't be told apart from the command's own failure, and a retry
could repeat remote mutations.

32-bit Linux (`linux-ia32`, `linux-arm`) maps to `@vercel/cli-support`, but that
package's `os` field (`!darwin`, `!linux`) means it is never installed there.
Those users always fall back, and the launcher warns once a day that support
will be removed from `vercel`.

## Opting out of the native binary

For this release, a native-platform user can still run this package's JS CLI
instead. The first match wins:

1. `VERCEL_CLI_USE_NATIVE_BINARY=0` (or `false`) opts out; `1` (or `true`) runs
   native even if the config opts out.
2. `"useNativeBinary": false` in the global config (`--global-config`/`-Q` is
   honored) opts out. Earlier releases wrote it with
   `vercel upgrade --disable-binary`.
3. Otherwise the native binary runs. `nativeBinaryAutoOptIn` is ignored.

An unreadable or malformed config counts as no preference. Opting out has no
effect where the mapped package is `@vercel/cli-support`.

## Telemetry

Every full CLI invocation from `vc.js` records which runtime ran:

| Key                 | Values                                                                                                | When                                             |
| ------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `launcher`          | `native`, `cli-support`, `dist`                                                                       | Always                                           |
| `launcher_source`   | `download` (downloaded on this run), `cache` (downloaded earlier)                                     | Only for `native` when the binary was downloaded |
| `launcher_target`   | `cli-support`, a native platform such as `linux-x64`                                                  | Only for `dist`                                  |
| `launcher_fallback` | `target_missing`, `download_failed`, `ENOENT`, `EACCES`, `ENOEXEC`, `opt_out`, `inherited_native_env` | Only for `dist`                                  |

The launcher passes `launcher_source` to the binary in
`__VERCEL_CLI_NATIVE_SOURCE`, and `pkg.js` removes it before any child process
starts.

`native` comes from a marker that the binary's `pkg.js` sets in-process, not
from `VERCEL_VC_NATIVE`. The binary exports that variable, so processes it
spawns (build scripts, dev commands) inherit it. A `vercel` they run skips the
native hand-off and runs this package's JS CLI, which reports
`inherited_native_env`.

Read them alongside the `platform`, `arch`, `libc`, and
`version_context_package_manager` events from the same invocation. Nothing is
recorded for the `--version` and `--help` fast paths, the internal build
worker, or when telemetry is disabled.

To see the events locally without sending them, run a command with
`VERCEL_TELEMETRY_DEBUG=1`, for example
`VERCEL_TELEMETRY_DEBUG=1 vercel telemetry status`.
