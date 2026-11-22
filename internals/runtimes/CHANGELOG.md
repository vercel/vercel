# @vercel-internals/runtimes

## 1.2.4

### Patch Changes

- Updated dependencies [5f55ccc]
- Updated dependencies [d0629bd]
  - @vercel/build-utils@15.1.0

## 1.2.3

### Patch Changes

- 2f0edaf: Report the runtime preset for services without a framework.
- Updated dependencies [2f0edaf]
  - @vercel/build-utils@15.0.2

## 1.2.2

### Patch Changes

- Updated dependencies [1a379a3]
  - @vercel/build-utils@15.0.1

## 1.2.1

### Patch Changes

- Updated dependencies [9b1b587]
- Updated dependencies [fec2df1]
- Updated dependencies [d123652]
  - @vercel/build-utils@15.0.0

## 1.2.0

### Minor Changes

- 787f498: Report proxy runtime mismatch before framework conflict.

### Patch Changes

- Updated dependencies [9abaa6d]
- Updated dependencies [179d4ab]
- Updated dependencies [d39dd61]
- Updated dependencies [5aa1b58]
  - @vercel/build-utils@14.23.0

## 1.1.19

### Patch Changes

- Updated dependencies [a19979c]
- Updated dependencies [a2e9f5d]
  - @vercel/build-utils@14.22.0

## 1.1.18

### Patch Changes

- Updated dependencies [bb42e81]
  - @vercel/build-utils@14.21.3

## 1.1.17

### Patch Changes

- Updated dependencies [cd68435]
  - @vercel/build-utils@14.21.2

## 1.1.16

### Patch Changes

- Updated dependencies [1336097]
  - @vercel/build-utils@14.21.1

## 1.1.15

### Patch Changes

- Updated dependencies [24a7e04]
- Updated dependencies [7e396f7]
  - @vercel/build-utils@14.21.0

## 1.1.14

### Patch Changes

- Updated dependencies [42cc083]
  - @vercel/build-utils@14.20.1

## 1.1.13

### Patch Changes

- Updated dependencies [e041037]
  - @vercel/build-utils@14.20.0

## 1.1.12

### Patch Changes

- Updated dependencies [e58b37a]
  - @vercel/build-utils@14.19.0

## 1.1.11

### Patch Changes

- Updated dependencies [94f6cea]
- Updated dependencies [3eeaad5]
- Updated dependencies [8ac5320]
  - @vercel/build-utils@14.18.0

## 1.1.10

### Patch Changes

- Updated dependencies [28a7ab7]
- Updated dependencies [28a7ab7]
  - @vercel/build-utils@14.17.0

## 1.1.9

### Patch Changes

- Updated dependencies [20c5940]
  - @vercel/build-utils@14.16.0

## 1.1.8

### Patch Changes

- 1f558d0: `vercel dev` runs schedules that target an `entrypoint`. It plans them into the same functions `vercel build` does, such as `_vercel/schedules/default`, registers each one with the local scheduler, and builds it with the entrypoint's builder. Schedule functions are only invoked by the scheduler, never by a public URL. Projects with services still reject schedule entrypoints in `vercel dev`.
- Updated dependencies [a7ef28c]
  - @vercel/build-utils@14.15.0

## 1.1.7

### Patch Changes

- Updated dependencies [deb48cd]
  - @vercel/build-utils@14.14.0

## 1.1.6

### Patch Changes

- Updated dependencies [3520d5c]
- Updated dependencies [ff3d2f7]
  - @vercel/frameworks@3.35.0
  - @vercel/build-utils@14.13.2

## 1.1.5

### Patch Changes

- 5082546: Build Python schedule entrypoints. A `.py` entrypoint such as `jobs/nightly.py` runs as a script once per firing in a private function under `_vercel/schedules/`. Entrypoints with the same `functions` config share one function, which runs the script for the dispatched schedule name, so the project's dependencies are bundled once per distinct config instead of once per script. Entrypoints without `functions` config share `_vercel/schedules/default`; the others' function is named after the `functions` patterns their config came from, such as `_vercel/schedules/jobs/report`. Schedule names must be unique within a shared function.

  Declared schedule entrypoints are not served as static files, but other files follow the normal static rules. When a project with Python schedule entrypoints publishes other `.py` files from its root, through the zero-config static fallback or `outputDirectory: "."`, `vercel build` now warns and lists them.

  Add `findMatchingFunction` to `@vercel/build-utils`, which returns the `functions` entry that applies to a function.

- Updated dependencies [5082546]
  - @vercel/build-utils@14.13.1

## 1.1.4

### Patch Changes

- Updated dependencies [34b2c8e]
  - @vercel/build-utils@14.13.0

## 1.1.3

### Patch Changes

- Updated dependencies [6e68e60]
  - @vercel/build-utils@14.12.0

## 1.1.2

### Patch Changes

- 7eb63c0: Accept runtime-specific schedule entrypoints and provide build plumbing for lowering dedicated entrypoints to function targets. All schedule entrypoints must use one runtime, including for static frameworks and `framework: null`. Entrypoints must also match the runtime of frameworks that own one (Next.js, FastAPI, Express). The builder contract still supports multiple entrypoints per function for future runtimes.
- Updated dependencies [888f59e]
- Updated dependencies [7eb63c0]
  - @vercel/build-utils@14.11.0

## 1.1.1

### Patch Changes

- Updated dependencies [53a6086]
  - @vercel/build-utils@14.10.2

## 1.1.0

### Minor Changes

- 360ffab: Re-add @vercel-internals/runtimes as a dev dep to fs-detectors.
