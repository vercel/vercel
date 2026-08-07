# @vercel/cli-config

## 0.2.1

### Patch Changes

- 6e29745: Gate the native CLI binary trampoline behind an explicit opt-in. The native `@vercel/vc-native-*` binary is only spawned when the user opts in via `vercel upgrade --enable-binary` (or the `useNativeBinary` global config flag); members of the `vercel` team are auto-opted-in when their teams are already loaded. Adds a zod-free `@vercel/cli-config/paths` subpath so the opt-in flag can be read on the CLI startup hot path without loading zod.

## 0.2.0

### Minor Changes

- fddeb55: Add configurable credentials storage handling across the CLI auth stack. Storage of credentials can be configured by the new `credStorage` key in global `config.json` or the new `VERCEL_TOKEN_STORAGE` environment variable. The environment variable takes precedence over the configuration key. Accepted values are `file` (store credentials in `auth.json`), `keyring` (store credentials in system keyring, e.g macOS Keychain or Secrets Service on Linux), and `auto` (try storing in keyring if available, fall back to `file` if keyring is not available).

  `@vercel/oidc` supports keyring-stored authentication credentials by delegating the OIDC minting to the CLI executable via `@vercel/cli-exec`.

## 0.1.2

### Patch Changes

- f45e466: Add opt-in automatic CLI updates via `vercel upgrade --enable-auto` and prompt users to enable them after a successful manual upgrade.

## 0.1.1

### Patch Changes

- 82edff0: Bump only

## 0.1.0

### Minor Changes

- 34f595a: Extract CLI global config and auth config helpers into new `@vercel/cli-config`, use `@effect/schema` for config validation.
