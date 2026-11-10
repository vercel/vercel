# @vercel-internals/cli-builder-integration

## 1.0.33

### Patch Changes

- 5f55ccc: Add an experimental Buildah image store cache, enabled with `VERCEL_BUILDAH_STORE_CACHE=1`, so builds reuse images and layers from earlier deployments. Concurrent service builds share one `--source-date-epoch` per deployment so their layers stay reusable. `@vercel/build-utils` now exports `resolveBuildConcurrency()`.
- 3407063: `vercel build` now reads a Next.js custom `deploymentId` from `routes-manifest.json` in the configured Output Directory, not only `<root>/.next`, so monorepo and custom `distDir` layouts register it.
- Updated dependencies [5f55ccc]
- Updated dependencies [d0629bd]
  - @vercel/build-utils@15.1.0
  - @vercel/client@18.10.0
  - @vercel-internals/builder-orchestration@1.0.30
  - @vercel-internals/runtimes@1.2.4
  - @vercel-internals/types@3.0.32
  - @vercel/fs-detectors@7.11.1
  - @vercel-internals/service-topology@1.0.28

## 1.0.32

### Patch Changes

- 2f0edaf: Report the runtime preset for services without a framework.
- Updated dependencies [2f0edaf]
- Updated dependencies [c424ce6]
  - @vercel-internals/runtimes@1.2.3
  - @vercel/build-utils@15.0.2
  - @vercel/fs-detectors@7.11.0
  - @vercel-internals/builder-orchestration@1.0.29
  - @vercel-internals/types@3.0.31
  - @vercel/client@18.9.3
  - @vercel-internals/service-topology@1.0.27

## 1.0.31

### Patch Changes

- Updated dependencies [1a379a3]
  - @vercel/build-utils@15.0.1
  - @vercel-internals/builder-orchestration@1.0.28
  - @vercel-internals/runtimes@1.2.2
  - @vercel-internals/types@3.0.30
  - @vercel/client@18.9.2
  - @vercel/fs-detectors@7.10.2
  - @vercel-internals/service-topology@1.0.26

## 1.0.30

### Patch Changes

- Updated dependencies [9e445b9]
- Updated dependencies [9b1b587]
- Updated dependencies [fec2df1]
- Updated dependencies [d123652]
  - @vercel/fs-detectors@7.10.1
  - @vercel/build-utils@15.0.0
  - @vercel-internals/types@3.0.29
  - @vercel-internals/builder-orchestration@1.0.27
  - @vercel-internals/service-topology@1.0.25
  - @vercel-internals/runtimes@1.2.1
  - @vercel/client@18.9.1

## 1.0.29

### Patch Changes

- a4d7467: Update `@vercel/prepare-flags-definitions` to 0.6.1.
- Updated dependencies [9abaa6d]
- Updated dependencies [179d4ab]
- Updated dependencies [787f498]
- Updated dependencies [d39dd61]
- Updated dependencies [5aa1b58]
  - @vercel/build-utils@14.23.0
  - @vercel-internals/runtimes@1.2.0
  - @vercel/fs-detectors@7.10.0
  - @vercel/client@18.9.0
  - @vercel-internals/builder-orchestration@1.0.26
  - @vercel-internals/types@3.0.28
  - @vercel-internals/service-topology@1.0.24

## 1.0.28

### Patch Changes

- @vercel/fs-detectors@7.9.12
- @vercel-internals/builder-orchestration@1.0.25
- @vercel-internals/service-topology@1.0.23

## 1.0.27

### Patch Changes

- 76c6c54: A daemon `root` can now point above the project root directory, such as `../..` in a monorepo, when the files are in the build. Paths outside the repository are still rejected.
- a19979c: Use Vercel Flags project activation metadata to detect when to embed flag definitions, including builds without installed SDK packages. Preserve explicit embedding overrides and existing SDK detection for projects without activation metadata.
- Updated dependencies [a19979c]
- Updated dependencies [a2e9f5d]
- Updated dependencies [e8d5551]
  - @vercel/build-utils@14.22.0
  - @vercel/fs-detectors@7.9.11
  - @vercel-internals/types@3.0.27
  - @vercel-internals/builder-orchestration@1.0.24
  - @vercel-internals/runtimes@1.1.19
  - @vercel/client@18.8.8
  - @vercel-internals/service-topology@1.0.22

## 1.0.26

### Patch Changes

- Updated dependencies [bb42e81]
  - @vercel/build-utils@14.21.3
  - @vercel-internals/builder-orchestration@1.0.23
  - @vercel-internals/runtimes@1.1.18
  - @vercel-internals/types@3.0.26
  - @vercel/client@18.8.7
  - @vercel/fs-detectors@7.9.10
  - @vercel-internals/service-topology@1.0.21

## 1.0.25

### Patch Changes

- Updated dependencies [cd68435]
  - @vercel/build-utils@14.21.2
  - @vercel-internals/builder-orchestration@1.0.22
  - @vercel-internals/runtimes@1.1.17
  - @vercel-internals/types@3.0.25
  - @vercel/client@18.8.6
  - @vercel/fs-detectors@7.9.9
  - @vercel-internals/service-topology@1.0.20

## 1.0.24

### Patch Changes

- Updated dependencies [72b1b84]
  - @vercel/client@18.8.5
  - @vercel-internals/builder-orchestration@1.0.21

## 1.0.23

### Patch Changes

- Updated dependencies [dad675d]
- Updated dependencies [1336097]
  - @vercel-internals/types@3.0.24
  - @vercel/build-utils@14.21.1
  - @vercel/fs-detectors@7.9.8
  - @vercel-internals/builder-orchestration@1.0.20
  - @vercel-internals/runtimes@1.1.16
  - @vercel/client@18.8.4
  - @vercel-internals/service-topology@1.0.19

## 1.0.22

### Patch Changes

- Updated dependencies [24a7e04]
- Updated dependencies [7e396f7]
- Updated dependencies [da51924]
- Updated dependencies [8845006]
  - @vercel/build-utils@14.21.0
  - @vercel-internals/service-topology@1.0.18
  - @vercel/fs-detectors@7.9.7
  - @vercel-internals/builder-orchestration@1.0.19
  - @vercel-internals/runtimes@1.1.15
  - @vercel-internals/types@3.0.23
  - @vercel/client@18.8.3

## 1.0.21

### Patch Changes

- Updated dependencies [0d62534]
- Updated dependencies [42cc083]
  - @vercel/fs-detectors@7.9.6
  - @vercel-internals/service-topology@1.0.17
  - @vercel/build-utils@14.20.1
  - @vercel-internals/builder-orchestration@1.0.18
  - @vercel-internals/runtimes@1.1.14
  - @vercel-internals/types@3.0.22
  - @vercel/client@18.8.2

## 1.0.20

### Patch Changes

- 7431c35: Add stable diagnostics for uncoded build failures and report `vercel build` error codes in telemetry. Preserve existing upstream error codes and non-interactive output fields.
- Updated dependencies [76b6025]
- Updated dependencies [e041037]
  - @vercel/client@18.8.1
  - @vercel/build-utils@14.20.0
  - @vercel-internals/builder-orchestration@1.0.17
  - @vercel-internals/runtimes@1.1.13
  - @vercel-internals/types@3.0.21
  - @vercel/fs-detectors@7.9.5
  - @vercel-internals/service-topology@1.0.16

## 1.0.19

### Patch Changes

- 22591c7: `vercel build` now includes `schedules` from a builder's own Build Output `config.json`, such as a framework that maps its scheduled tasks to Vercel Schedules, alongside `vercel.json` schedules. A schedule name defined in more than one place fails the build.

## 1.0.18

### Patch Changes

- Updated dependencies [e58b37a]
  - @vercel/build-utils@14.19.0
  - @vercel/client@18.8.0
  - @vercel-internals/builder-orchestration@1.0.16
  - @vercel-internals/runtimes@1.1.12
  - @vercel-internals/types@3.0.20
  - @vercel/fs-detectors@7.9.4
  - @vercel-internals/service-topology@1.0.15

## 1.0.17

### Patch Changes

- 8ac5320: Add an experimental workspace-scoped install path for Node builds to avoid installing unrelated monorepo workspaces.
- Updated dependencies [800d820]
- Updated dependencies [94f6cea]
- Updated dependencies [3eeaad5]
- Updated dependencies [8ac5320]
  - @vercel/client@18.7.0
  - @vercel/build-utils@14.18.0
  - @vercel/fs-detectors@7.9.3
  - @vercel-internals/builder-orchestration@1.0.15
  - @vercel-internals/runtimes@1.1.11
  - @vercel-internals/types@3.0.19
  - @vercel-internals/service-topology@1.0.14

## 1.0.16

### Patch Changes

- 28a7ab7: Build top-level `daemons` when `VERCEL_ENABLE_DAEMONS_BOA=1`: `vercel build` builds the project as usual, pushes each daemon's Dockerfile image, and writes a Build Output API descriptor to `daemons/<name>/.vc-config.json`.
- 28a7ab7: Prevent static deployments from accidentally publishing daemon source files. Both static builders skip nested daemon roots with a warning and reject publishing a directory that is itself a daemon root. Build scripts can still deliberately publish files through a separate output directory.
- Updated dependencies [28a7ab7]
- Updated dependencies [28a7ab7]
  - @vercel/build-utils@14.17.0
  - @vercel-internals/builder-orchestration@1.0.14
  - @vercel-internals/runtimes@1.1.10
  - @vercel-internals/types@3.0.18
  - @vercel/client@18.6.2
  - @vercel/fs-detectors@7.9.2
  - @vercel-internals/service-topology@1.0.13

## 1.0.15

### Patch Changes

- Updated dependencies [20c5940]
  - @vercel/build-utils@14.16.0
  - @vercel/client@18.6.1
  - @vercel-internals/builder-orchestration@1.0.13
  - @vercel-internals/runtimes@1.1.9
  - @vercel-internals/types@3.0.17
  - @vercel/fs-detectors@7.9.1
  - @vercel-internals/service-topology@1.0.12

## 1.0.14

### Patch Changes

- a7ef28c: Accept a top-level `daemons` field in `vercel.json`. `vercel dev` warns that it doesn't run daemons, and `vercel build` doesn't build them yet.
- 1f558d0: `vercel dev` runs schedules that target an `entrypoint`. It plans them into the same functions `vercel build` does, such as `_vercel/schedules/default`, registers each one with the local scheduler, and builds it with the entrypoint's builder. Schedule functions are only invoked by the scheduler, never by a public URL. Projects with services still reject schedule entrypoints in `vercel dev`.
- Updated dependencies [a7ef28c]
- Updated dependencies [1f558d0]
- Updated dependencies [b0c985b]
- Updated dependencies [5772e9e]
  - @vercel/build-utils@14.15.0
  - @vercel/client@18.6.0
  - @vercel-internals/runtimes@1.1.8
  - @vercel/fs-detectors@7.9.0
  - @vercel-internals/builder-orchestration@1.0.12
  - @vercel-internals/types@3.0.16
  - @vercel-internals/service-topology@1.0.11

## 1.0.13

### Patch Changes

- Updated dependencies [deb48cd]
  - @vercel/build-utils@14.14.0
  - @vercel/client@18.5.0
  - @vercel-internals/builder-orchestration@1.0.11
  - @vercel-internals/runtimes@1.1.7
  - @vercel-internals/types@3.0.15
  - @vercel/fs-detectors@7.8.1
  - @vercel-internals/service-topology@1.0.10

## 1.0.12

### Patch Changes

- Updated dependencies [86268cb]
  - @vercel/client@18.4.8
  - @vercel-internals/builder-orchestration@1.0.10

## 1.0.11

### Patch Changes

- Updated dependencies [3520d5c]
- Updated dependencies [ff3d2f7]
  - @vercel/frameworks@3.35.0
  - @vercel/fs-detectors@7.8.0
  - @vercel/build-utils@14.13.2
  - @vercel-internals/builder-orchestration@1.0.9
  - @vercel-internals/runtimes@1.1.6
  - @vercel-internals/service-topology@1.0.9
  - @vercel-internals/types@3.0.14
  - @vercel/client@18.4.7

## 1.0.10

### Patch Changes

- 5082546: Build Python schedule entrypoints. A `.py` entrypoint such as `jobs/nightly.py` runs as a script once per firing in a private function under `_vercel/schedules/`. Entrypoints with the same `functions` config share one function, which runs the script for the dispatched schedule name, so the project's dependencies are bundled once per distinct config instead of once per script. Entrypoints without `functions` config share `_vercel/schedules/default`; the others' function is named after the `functions` patterns their config came from, such as `_vercel/schedules/jobs/report`. Schedule names must be unique within a shared function.

  Declared schedule entrypoints are not served as static files, but other files follow the normal static rules. When a project with Python schedule entrypoints publishes other `.py` files from its root, through the zero-config static fallback or `outputDirectory: "."`, `vercel build` now warns and lists them.

  Add `findMatchingFunction` to `@vercel/build-utils`, which returns the `functions` entry that applies to a function.

- Updated dependencies [5082546]
  - @vercel-internals/runtimes@1.1.5
  - @vercel/build-utils@14.13.1
  - @vercel/fs-detectors@7.7.3
  - @vercel-internals/builder-orchestration@1.0.8
  - @vercel-internals/types@3.0.13
  - @vercel/client@18.4.6
  - @vercel-internals/service-topology@1.0.8

## 1.0.9

### Patch Changes

- Updated dependencies [34b2c8e]
  - @vercel/build-utils@14.13.0
  - @vercel-internals/builder-orchestration@1.0.7
  - @vercel-internals/runtimes@1.1.4
  - @vercel-internals/types@3.0.12
  - @vercel/client@18.4.5
  - @vercel/fs-detectors@7.7.2
  - @vercel-internals/service-topology@1.0.7

## 1.0.8

### Patch Changes

- Updated dependencies [693a289]
  - @vercel-internals/types@3.0.11

## 1.0.7

### Patch Changes

- Updated dependencies [1cfef7b]
- Updated dependencies [6e68e60]
  - @vercel-internals/types@3.0.10
  - @vercel/build-utils@14.12.0
  - @vercel-internals/builder-orchestration@1.0.6
  - @vercel-internals/runtimes@1.1.3
  - @vercel/client@18.4.4
  - @vercel/fs-detectors@7.7.1
  - @vercel-internals/service-topology@1.0.6

## 1.0.6

### Patch Changes

- 7eb63c0: Accept runtime-specific schedule entrypoints and provide build plumbing for lowering dedicated entrypoints to function targets. All schedule entrypoints must use one runtime, including for static frameworks and `framework: null`. Entrypoints must also match the runtime of frameworks that own one (Next.js, FastAPI, Express). The builder contract still supports multiple entrypoints per function for future runtimes.
- Updated dependencies [888f59e]
- Updated dependencies [2a134f6]
- Updated dependencies [0d38103]
- Updated dependencies [7eb63c0]
  - @vercel/build-utils@14.11.0
  - @vercel/fs-detectors@7.7.0
  - @vercel-internals/builder-orchestration@1.0.5
  - @vercel-internals/runtimes@1.1.2
  - @vercel/client@18.4.3
  - @vercel-internals/types@3.0.9
  - @vercel-internals/service-topology@1.0.5

## 1.0.5

### Patch Changes

- Updated dependencies [a20c274]
  - @vercel/fs-detectors@7.6.2
  - @vercel-internals/builder-orchestration@1.0.4
  - @vercel-internals/service-topology@1.0.4

## 1.0.4

### Patch Changes

- Updated dependencies [53a6086]
  - @vercel/build-utils@14.10.2
  - @vercel-internals/builder-orchestration@1.0.3
  - @vercel-internals/runtimes@1.1.1
  - @vercel-internals/types@3.0.8
  - @vercel/client@18.4.2
  - @vercel/fs-detectors@7.6.1
  - @vercel-internals/service-topology@1.0.3

## 1.0.3

### Patch Changes

- @vercel-internals/types@3.0.7

## 1.0.2

### Patch Changes

- Updated dependencies [360ffab]
  - @vercel-internals/runtimes@1.1.0
  - @vercel/fs-detectors@7.6.0
  - @vercel-internals/builder-orchestration@1.0.2
  - @vercel-internals/service-topology@1.0.2

## 1.0.1

### Patch Changes

- Updated dependencies [e22e20f]
  - @vercel/fs-detectors@7.5.0
  - @vercel-internals/builder-orchestration@1.0.1
  - @vercel-internals/service-topology@1.0.1
