# @vercel/rust

## 24.0.0

### Minor Changes

- 2a5ebec: Run container schedule commands through a schedules dispatcher added to the built image.

### Patch Changes

- b2a9eb5: Expand HTTP regression coverage for the standalone IPC proxy.
- Updated dependencies [5f55ccc]
- Updated dependencies [d0629bd]
  - @vercel/build-utils@15.1.0

## 23.0.2

### Patch Changes

- 2f0edaf: Report the runtime preset for services without a framework.
- Updated dependencies [2f0edaf]
  - @vercel/build-utils@15.0.2

## 23.0.1

### Patch Changes

- Updated dependencies [1a379a3]
  - @vercel/build-utils@15.0.1

## 23.0.0

### Patch Changes

- 885a478: Extract shared Go IPC transport, request context handling and Go toolchain resolution without changing the server proxy lifecycle.
- Updated dependencies [9b1b587]
- Updated dependencies [fec2df1]
- Updated dependencies [d123652]
  - @vercel/build-utils@15.0.0

## 22.0.0

### Patch Changes

- Updated dependencies [9abaa6d]
- Updated dependencies [179d4ab]
- Updated dependencies [d39dd61]
- Updated dependencies [5aa1b58]
  - @vercel/build-utils@14.23.0

## 21.0.0

### Patch Changes

- Updated dependencies [a19979c]
- Updated dependencies [a2e9f5d]
  - @vercel/build-utils@14.22.0

## 20.0.3

### Patch Changes

- Updated dependencies [bb42e81]
  - @vercel/build-utils@14.21.3

## 20.0.2

### Patch Changes

- Updated dependencies [cd68435]
  - @vercel/build-utils@14.21.2

## 20.0.1

### Patch Changes

- Updated dependencies [1336097]
  - @vercel/build-utils@14.21.1

## 20.0.0

### Patch Changes

- Updated dependencies [24a7e04]
- Updated dependencies [7e396f7]
  - @vercel/build-utils@14.21.0

## 19.0.1

### Patch Changes

- Updated dependencies [42cc083]
  - @vercel/build-utils@14.20.1

## 19.0.0

### Patch Changes

- Updated dependencies [e041037]
  - @vercel/build-utils@14.20.0

## 18.0.0

### Patch Changes

- Updated dependencies [e58b37a]
  - @vercel/build-utils@14.19.0

## 17.0.0

### Patch Changes

- Updated dependencies [94f6cea]
- Updated dependencies [3eeaad5]
- Updated dependencies [8ac5320]
  - @vercel/build-utils@14.18.0

## 16.0.0

### Patch Changes

- Updated dependencies [28a7ab7]
- Updated dependencies [28a7ab7]
  - @vercel/build-utils@14.17.0

## 15.0.0

### Patch Changes

- Updated dependencies [20c5940]
  - @vercel/build-utils@14.16.0

## 14.0.0

### Patch Changes

- Updated dependencies [a7ef28c]
  - @vercel/build-utils@14.15.0

## 13.0.0

### Patch Changes

- Updated dependencies [deb48cd]
  - @vercel/build-utils@14.14.0

## 12.0.2

### Patch Changes

- Updated dependencies [ff3d2f7]
  - @vercel/build-utils@14.13.2

## 12.0.1

### Patch Changes

- Updated dependencies [5082546]
  - @vercel/build-utils@14.13.1

## 12.0.0

### Patch Changes

- Updated dependencies [34b2c8e]
  - @vercel/build-utils@14.13.0

## 11.0.0

### Patch Changes

- Updated dependencies [6e68e60]
  - @vercel/build-utils@14.12.0

## 10.0.0

### Patch Changes

- Updated dependencies [888f59e]
- Updated dependencies [7eb63c0]
  - @vercel/build-utils@14.11.0

## 9.0.2

### Patch Changes

- Updated dependencies [53a6086]
  - @vercel/build-utils@14.10.2

## 9.0.1

### Patch Changes

- Updated dependencies [f9d0e90]
- Updated dependencies [8a277e4]
- Updated dependencies [66e443e]
- Updated dependencies [08b0be2]
  - @vercel/build-utils@14.10.1

## 9.0.0

### Patch Changes

- Updated dependencies [2a57243]
- Updated dependencies [54a6d73]
- Updated dependencies [3d16792]
  - @vercel/build-utils@14.10.0

## 8.0.3

### Patch Changes

- Updated dependencies [55e8d1e]
  - @vercel/build-utils@14.9.3

## 8.0.2

### Patch Changes

- Updated dependencies [b174f14]
  - @vercel/build-utils@14.9.2

## 8.0.1

### Patch Changes

- Updated dependencies [1817491]
  - @vercel/build-utils@14.9.1

## 8.0.0

### Patch Changes

- Updated dependencies [392c759]
  - @vercel/build-utils@14.9.0

## 7.0.0

### Patch Changes

- Updated dependencies [a652a99]
  - @vercel/build-utils@14.8.0

## 6.0.0

### Patch Changes

- Updated dependencies [26b891e]
- Updated dependencies [37ff9da]
  - @vercel/build-utils@14.7.0

## 5.0.1

### Patch Changes

- Updated dependencies [aad9541]
  - @vercel/build-utils@14.6.1

## 5.0.0

### Patch Changes

- Updated dependencies [e82de48]
  - @vercel/build-utils@14.6.0

## 4.0.1

### Patch Changes

- Updated dependencies [a443e57]
  - @vercel/build-utils@14.5.1

## 4.0.0

### Patch Changes

- Updated dependencies [90afd71]
  - @vercel/build-utils@14.5.0

## 3.0.1

### Patch Changes

- 359a57c: Mark the Rust framework as stable. Detection stays keyed on `src/main.rs` so `api/**/*.rs` function projects (which declare a `[[bin]]` per handler) remain framework-less and build zero-config; `[[bin]]`-only servers and cargo workspaces are supported by setting the Rust preset manually. Projects with an explicit output directory (e.g. wasm frontends built with Trunk) keep the static-build path instead of the Rust runtime, while preserving `api/**/*.rs` functions, and committed prebuilt output is served directly when no build command is configured.
- Updated dependencies [e5b0363]
  - @vercel/build-utils@14.4.1

## 3.0.0

### Patch Changes

- Updated dependencies [f8add0a]
  - @vercel/build-utils@14.4.0

## 2.0.0

### Patch Changes

- 0d71a61: Declare `@vercel/build-utils` as a peer dependency provided by Vercel CLI so builders load correctly with strict dependency isolation, including pnpm global installs.
- Updated dependencies [0b08df6]
- Updated dependencies [cd6b038]
- Updated dependencies [96444ba]
  - @vercel/build-utils@14.3.0

## 1.5.0

### Minor Changes

- bd5f1a7: Add standalone server mode for Rust, matching the Go framework preset. A project
  that is not an `api/**` handler and does not depend on the `vercel_runtime` crate
  now deploys as a plain HTTP server listening on `$PORT`, adapted to the
  executable runtime by the shared IPC proxy. The binary comes from `Cargo.toml`;
  for a multi-binary crate or workspace, point the entrypoint at the binary or set
  `default-run`.

  Projects using `vercel_runtime` are unaffected. `waitUntil` and request-scoped
  logs still require `vercel_runtime`. Cargo's `target` directory is now excluded
  from the files the builder downloads.

## 1.4.2

### Patch Changes

- 7846a8c: Connect the JavaScript runtime builds to their native Python and Rust build tasks.

## 1.4.1

### Patch Changes

- 6d7fbfa: Bump all workspace packages to trigger a full publish from vercel-internal.

## 1.4.0

### Minor Changes

- 69892ba: Fix `vercel dev` instability with the Rust runtime by allocating a unique free port per dev server instance. Previously the dev server relied on the `vercel_runtime` crate's fixed default port, which caused intermittent "address already in use" failures (surfacing as `Process exited before completing request`) when `vercel dev` restarted the server between requests. The runtime now passes a `VERCEL_DEV_PORT`, waits for the process to exit during shutdown so the port is released, and reports a clear error on port collisions instead of silently falling back to lambda invocation. The shutdown grace period now also allows the runtime's dev-mode `waitUntil` drain to complete before force-killing, so background work registered via `waitUntil` runs as expected under `vercel dev`.

## 1.3.0

### Minor Changes

- 6860c32: Add project manifest to rust builder.

## 1.2.0

### Minor Changes

- c56f851: Upgrade to TypeScript 5.9

## 1.1.1

### Patch Changes

- Support entry point without extension for dev server ([#15998](https://github.com/vercel/vercel/pull/15998))

## 1.1.0

### Minor Changes

- Support configuration via vercel.toml ([#15750](https://github.com/vercel/vercel/pull/15750))

## 1.0.6

### Patch Changes

- Switch to using smol-toml for toml parsing ([#15730](https://github.com/vercel/vercel/pull/15730))

## 1.0.5

### Patch Changes

- Do not allow production prebuilt deployments on Windows ([#14724](https://github.com/vercel/vercel/pull/14724))

## 1.0.4

### Patch Changes

- Use `workspace:*` for workspace dependencies ([#14396](https://github.com/vercel/vercel/pull/14396))

## 1.0.3

### Patch Changes

- Tweak logs, support `runtimeLanguage` in build outputs ([#14347](https://github.com/vercel/vercel/pull/14347))

## 1.0.2

### Patch Changes

- Fix default architecture, support cross compile to arm64 ([#14329](https://github.com/vercel/vercel/pull/14329))

## 1.0.1

### Patch Changes

- Re-publish due to failed run ([#14316](https://github.com/vercel/vercel/pull/14316))

## 1.0.0

### Major Changes

- Introduce @vercel/rust ([#14315](https://github.com/vercel/vercel/pull/14315))
