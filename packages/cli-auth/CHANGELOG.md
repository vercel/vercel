# @vercel/cli-auth

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
