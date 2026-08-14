# @vercel/rust

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
