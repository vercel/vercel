# @vercel/cli-auth

## 0.3.13

### Patch Changes

- Updated dependencies [bcdc735]
  - @vercel/cli-config@0.3.4

## 0.3.12

### Patch Changes

- Updated dependencies [b0e01f5]
  - @vercel/cli-config@0.3.3

## 0.3.11

### Patch Changes

- Updated dependencies [637c7b9]
  - @vercel/cli-config@0.3.2

## 0.3.10

### Patch Changes

- Updated dependencies [85cfdc3]
  - @vercel/cli-config@0.3.1

## 0.3.9

### Patch Changes

- Updated dependencies [c610f14]
  - @vercel/cli-config@0.3.0

## 0.3.8

### Patch Changes

- Updated dependencies [c4c4f3f]
  - @vercel/cli-config@0.2.7

## 0.3.7

### Patch Changes

- Updated dependencies [55e8d1e]
  - @vercel/cli-config@0.2.6

## 0.3.6

### Patch Changes

- Updated dependencies [38a4acd]
  - @vercel/cli-config@0.2.5

## 0.3.5

### Patch Changes

- Updated dependencies [7a3a2ef]
  - @vercel/cli-config@0.2.4

## 0.3.4

### Patch Changes

- 2da7809: Remove redundant and ineffective package tests.

## 0.3.3

### Patch Changes

- Updated dependencies [92dfd87]
  - @vercel/cli-config@0.2.3

## 0.3.2

### Patch Changes

- 6d7fbfa: Bump all workspace packages to trigger a full publish from vercel-internal.
- Updated dependencies [6d7fbfa]
  - @vercel/cli-config@0.2.2

## 0.3.1

### Patch Changes

- Updated dependencies [6e29745]
  - @vercel/cli-config@0.2.1

## 0.3.0

### Minor Changes

- fddeb55: Add configurable credentials storage handling across the CLI auth stack. Storage of credentials can be configured by the new `credStorage` key in global `config.json` or the new `VERCEL_TOKEN_STORAGE` environment variable. The environment variable takes precedence over the configuration key. Accepted values are `file` (store credentials in `auth.json`), `keyring` (store credentials in system keyring, e.g macOS Keychain or Secrets Service on Linux), and `auto` (try storing in keyring if available, fall back to `file` if keyring is not available).

  `@vercel/oidc` supports keyring-stored authentication credentials by delegating the OIDC minting to the CLI executable via `@vercel/cli-exec`.

### Patch Changes

- Updated dependencies [fddeb55]
  - @vercel/cli-config@0.2.0

## 0.2.0

### Minor Changes

- c56f851: Upgrade to TypeScript 5.9

## 0.1.1

### Patch Changes

- bf07448: Revert "auth: Make it possible to store CLI credentials in OS keychain (#16083)"

## 0.1.0

### Minor Changes

- 24686d0: Add configurable auth token storage with keyring-backed persistence and file fallback support.

### Patch Changes

- d36ee35: Ensure root-level build outputs are restored before packaging preview tarballs.
- 56c9f89: add missing prettier dev dependency

## 0.0.1

### Patch Changes

- introduce `@vercel/cli-auth` ([#14103](https://github.com/vercel/vercel/pull/14103))
