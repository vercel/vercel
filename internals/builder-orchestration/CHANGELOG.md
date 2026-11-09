# @vercel-internals/builder-orchestration

## 1.0.30

### Patch Changes

- Updated dependencies [5f55ccc]
- Updated dependencies [d0629bd]
  - @vercel/build-utils@15.1.0
  - @vercel/client@18.10.0
  - @vercel/fs-detectors@7.11.1

## 1.0.29

### Patch Changes

- Updated dependencies [2f0edaf]
- Updated dependencies [c424ce6]
  - @vercel/build-utils@15.0.2
  - @vercel/fs-detectors@7.11.0
  - @vercel/client@18.9.3

## 1.0.28

### Patch Changes

- Updated dependencies [1a379a3]
  - @vercel/build-utils@15.0.1
  - @vercel/client@18.9.2
  - @vercel/fs-detectors@7.10.2

## 1.0.27

### Patch Changes

- Updated dependencies [9e445b9]
- Updated dependencies [9b1b587]
- Updated dependencies [fec2df1]
- Updated dependencies [d123652]
  - @vercel/fs-detectors@7.10.1
  - @vercel/build-utils@15.0.0
  - @vercel/client@18.9.1

## 1.0.26

### Patch Changes

- Updated dependencies [9abaa6d]
- Updated dependencies [179d4ab]
- Updated dependencies [787f498]
- Updated dependencies [d39dd61]
- Updated dependencies [5aa1b58]
  - @vercel/build-utils@14.23.0
  - @vercel/fs-detectors@7.10.0
  - @vercel/client@18.9.0

## 1.0.25

### Patch Changes

- @vercel/fs-detectors@7.9.12

## 1.0.24

### Patch Changes

- Updated dependencies [a19979c]
- Updated dependencies [a2e9f5d]
  - @vercel/build-utils@14.22.0
  - @vercel/fs-detectors@7.9.11
  - @vercel/client@18.8.8

## 1.0.23

### Patch Changes

- Updated dependencies [bb42e81]
  - @vercel/build-utils@14.21.3
  - @vercel/client@18.8.7
  - @vercel/fs-detectors@7.9.10

## 1.0.22

### Patch Changes

- Updated dependencies [cd68435]
  - @vercel/build-utils@14.21.2
  - @vercel/client@18.8.6
  - @vercel/fs-detectors@7.9.9

## 1.0.21

### Patch Changes

- Updated dependencies [72b1b84]
  - @vercel/client@18.8.5

## 1.0.20

### Patch Changes

- Updated dependencies [1336097]
  - @vercel/build-utils@14.21.1
  - @vercel/fs-detectors@7.9.8
  - @vercel/client@18.8.4

## 1.0.19

### Patch Changes

- Updated dependencies [24a7e04]
- Updated dependencies [7e396f7]
- Updated dependencies [da51924]
- Updated dependencies [8845006]
  - @vercel/build-utils@14.21.0
  - @vercel/fs-detectors@7.9.7
  - @vercel/client@18.8.3

## 1.0.18

### Patch Changes

- Updated dependencies [0d62534]
- Updated dependencies [42cc083]
  - @vercel/fs-detectors@7.9.6
  - @vercel/build-utils@14.20.1
  - @vercel/client@18.8.2

## 1.0.17

### Patch Changes

- Updated dependencies [76b6025]
- Updated dependencies [e041037]
  - @vercel/client@18.8.1
  - @vercel/build-utils@14.20.0
  - @vercel/fs-detectors@7.9.5

## 1.0.16

### Patch Changes

- Updated dependencies [e58b37a]
  - @vercel/build-utils@14.19.0
  - @vercel/client@18.8.0
  - @vercel/fs-detectors@7.9.4

## 1.0.15

### Patch Changes

- Updated dependencies [800d820]
- Updated dependencies [94f6cea]
- Updated dependencies [3eeaad5]
- Updated dependencies [8ac5320]
  - @vercel/client@18.7.0
  - @vercel/build-utils@14.18.0
  - @vercel/fs-detectors@7.9.3

## 1.0.14

### Patch Changes

- 28a7ab7: Prevent static deployments from accidentally publishing daemon source files. Both static builders skip nested daemon roots with a warning and reject publishing a directory that is itself a daemon root. Build scripts can still deliberately publish files through a separate output directory.
- Updated dependencies [28a7ab7]
- Updated dependencies [28a7ab7]
  - @vercel/build-utils@14.17.0
  - @vercel/client@18.6.2
  - @vercel/fs-detectors@7.9.2

## 1.0.13

### Patch Changes

- Updated dependencies [20c5940]
  - @vercel/build-utils@14.16.0
  - @vercel/client@18.6.1
  - @vercel/fs-detectors@7.9.1

## 1.0.12

### Patch Changes

- Updated dependencies [a7ef28c]
- Updated dependencies [1f558d0]
- Updated dependencies [b0c985b]
- Updated dependencies [5772e9e]
  - @vercel/build-utils@14.15.0
  - @vercel/client@18.6.0
  - @vercel/fs-detectors@7.9.0

## 1.0.11

### Patch Changes

- Updated dependencies [deb48cd]
  - @vercel/build-utils@14.14.0
  - @vercel/client@18.5.0
  - @vercel/fs-detectors@7.8.1

## 1.0.10

### Patch Changes

- Updated dependencies [86268cb]
  - @vercel/client@18.4.8

## 1.0.9

### Patch Changes

- Updated dependencies [3520d5c]
- Updated dependencies [ff3d2f7]
  - @vercel/frameworks@3.35.0
  - @vercel/fs-detectors@7.8.0
  - @vercel/build-utils@14.13.2
  - @vercel/client@18.4.7

## 1.0.8

### Patch Changes

- Updated dependencies [5082546]
  - @vercel/build-utils@14.13.1
  - @vercel/fs-detectors@7.7.3
  - @vercel/client@18.4.6

## 1.0.7

### Patch Changes

- Updated dependencies [34b2c8e]
  - @vercel/build-utils@14.13.0
  - @vercel/client@18.4.5
  - @vercel/fs-detectors@7.7.2

## 1.0.6

### Patch Changes

- Updated dependencies [6e68e60]
  - @vercel/build-utils@14.12.0
  - @vercel/client@18.4.4
  - @vercel/fs-detectors@7.7.1

## 1.0.5

### Patch Changes

- 7eb63c0: Accept runtime-specific schedule entrypoints and provide build plumbing for lowering dedicated entrypoints to function targets. All schedule entrypoints must use one runtime, including for static frameworks and `framework: null`. Entrypoints must also match the runtime of frameworks that own one (Next.js, FastAPI, Express). The builder contract still supports multiple entrypoints per function for future runtimes.
- Updated dependencies [888f59e]
- Updated dependencies [2a134f6]
- Updated dependencies [0d38103]
- Updated dependencies [7eb63c0]
  - @vercel/build-utils@14.11.0
  - @vercel/fs-detectors@7.7.0
  - @vercel/client@18.4.3

## 1.0.4

### Patch Changes

- Updated dependencies [a20c274]
  - @vercel/fs-detectors@7.6.2

## 1.0.3

### Patch Changes

- Updated dependencies [53a6086]
  - @vercel/build-utils@14.10.2
  - @vercel/client@18.4.2
  - @vercel/fs-detectors@7.6.1

## 1.0.2

### Patch Changes

- Updated dependencies [360ffab]
  - @vercel/fs-detectors@7.6.0

## 1.0.1

### Patch Changes

- Updated dependencies [e22e20f]
  - @vercel/fs-detectors@7.5.0
