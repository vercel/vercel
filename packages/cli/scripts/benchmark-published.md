# CLI startup and deployment preparation benchmarks

Run from `packages/cli` after building the workspace packages. Use the same Node
version and target as the publishing workflow; these measurements used Node
24.14.1 and `@yao-pkg/pkg` 6.19.0 on macOS arm64.

```sh
node scripts/build-binary.mjs --target node24.14.1-macos-arm64 --output ./dist-bin/vercel-benchmark
BENCHMARK_BINARY="$PWD/dist-bin/vercel-benchmark" node scripts/benchmark-all.mjs 30 /tmp/vercel-binary-results.json
```

The build inherits SEA, bootstrap code caching, and uncompressed packaging from
`pkg.config.mjs`. Building can download the runtime if it is not cached.
Benchmark execution requires no account or network access.

## Measured improvement

Medians in milliseconds, measured as fresh-process wall time after three warmups
per variant. Baseline commit: `87773b07e02e0603f8d75bcc227db38e71e68de3`.
The baseline used the original publishing configuration, including Brotli
compression. Each matrix entry has 30 samples per binary.

| Command / fixture        | Default compile cache, before → after | Compile cache disabled, before → after |
| ------------------------ | ------------------------------------: | -------------------------------------: |
| Help                     |                        128.94 → 71.02 |                         152.90 → 86.48 |
| Deploy, no Git, files    |                       245.33 → 116.57 |                        272.26 → 135.02 |
| Deploy, no Git, archive  |                       272.10 → 139.33 |                        296.28 → 159.19 |
| Deploy, Git, files       |                       273.23 → 127.22 |                        297.59 → 146.13 |
| Deploy, Git, archive     |                       304.06 → 141.25 |                        327.24 → 159.19 |
| Dry run, no Git, files   |                       197.55 → 115.14 |                        223.53 → 135.71 |
| Dry run, no Git, archive |                       220.01 → 137.25 |                        246.78 → 157.00 |
| Dry run, Git, files      |                       202.21 → 117.94 |                        222.99 → 136.96 |
| Dry run, Git, archive    |                       220.30 → 137.63 |                        245.96 → 157.05 |

A separate 500-sample verification of the final binary measured **125.91 ms** for
Git deployment preparation with files and **141.15 ms** with an archive (default
compile cache). Compared with the baseline, that is approximately **54% faster**
for both modes; help is **45% faster**.

The macOS arm64 binary grew from 125,643,472 to 146,349,520 bytes (**16.5%**) because
removing compression avoids decompression during startup. Local binaries use
ad-hoc signing. Release signing, notarization, and first-launch Gatekeeper checks
are outside these measurements. Other platforms need their own measurements.

## Optimization techniques

- Defer heavy shared dependencies until their functionality is used, including
  prompts, authentication helpers, config compilation, and repository discovery.
  The shared loader benefits every command that uses it.
- Bundle shared packages and expose build-utils exports through memoized lazy
  getters. Keep public exports and deep import paths compatible. Namespace Zod
  imports allow unused schema APIs to be removed from the bundle.
- Target the CLI's minimum supported Node version and minify syntax and whitespace
  to reduce parsing work while preserving function names and code splitting.
- Resolve Git metadata concurrently with local file collection. Run independent
  Git queries in parallel and avoid the macOS Git launcher when the selected Git
  is Apple's system executable. Preserve custom Git executables on PATH.
- Avoid unnecessary lockfile scans and schema initialization for small local
  configuration checks. Write disposable telemetry session state atomically
  without synchronously flushing it to disk.
- Cache SEA bootstrap compilation and avoid native bundle decompression.

## What the harness measures

`benchmark-all.mjs` runs 18 variants sequentially: help plus normal deployment
preparation and `deploy --dry`, each with Git/no Git and files/archive, with default
compile-cache behavior and `NODE_DISABLE_COMPILE_CACHE=1`. Without
`BENCHMARK_BINARY`, the scripts exercise the built JavaScript CLI instead.

The runner records raw samples, runtime version, binary size and SHA-256, and
requires SEA detection when a binary is supplied. Keep generated reports outside
the source tree; they contain local paths and timing data specific to the machine.

Deploy fixtures contain 100 source files (about 280 KB) plus 100 ignored files.
Synthetic configuration and credentials isolate the process from the user's
account. Two deployment metadata reads receive in-memory responses; the harness
stops after serializing the deployment request, before sending it. Thus these
numbers measure local preparation, not upload, remote build, or actual deployment.

A preloaded guard blocks network APIs and fails even if an attempted call is
caught by the CLI. Every measured process reported zero network attempts. Checks
cover help output, prepared file manifests, ignored files, and complete Git
metadata. Archives receive structural and file-count checks; their contents are
not unpacked for comparison, and variable archive hashes and sizes are excluded.

The separate `benchmark-startup.mjs` and `benchmark-deploy.mjs` runners accept a
sample count as their first argument. The deploy runner supports
`BENCHMARK_DEPLOY_NO_GIT=1` and `BENCHMARK_DEPLOY_DRY_RUN=1`; it runs both file and
archive modes. All runners use three warmups per mode.
