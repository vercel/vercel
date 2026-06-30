# @vercel/error-utils

## 2.2.0

### Minor Changes

- fddeb55: Add configurable credentials storage handling across the CLI auth stack. Storage of credentials can be configured by the new `credStorage` key in global `config.json` or the new `VERCEL_TOKEN_STORAGE` environment variable. The environment variable takes precedence over the configuration key. Accepted values are `file` (store credentials in `auth.json`), `keyring` (store credentials in system keyring, e.g macOS Keychain or Secrets Service on Linux), and `auto` (try storing in keyring if available, fall back to `file` if keyring is not available).

  `@vercel/oidc` supports keyring-stored authentication credentials by delegating the OIDC minting to the CLI executable via `@vercel/cli-exec`.

## 2.1.0

### Minor Changes

- c56f851: Upgrade to TypeScript 5.9

## 2.0.3

### Patch Changes

- Move `@vercel/error-utils` to `vitest` ([#12541](https://github.com/vercel/vercel/pull/12541))

## 2.0.2

### Patch Changes

- use Node.js `util.types.isNativeError` for `isError` method ([#10764](https://github.com/vercel/vercel/pull/10764))

## 2.0.1

### Patch Changes

- fix `files` in package.json to use `dist` ([#10378](https://github.com/vercel/vercel/pull/10378))

## 2.0.0

### Major Changes

- BREAKING CHANGE: Drop Node.js 14, bump minimum to Node.js 16 ([#10369](https://github.com/vercel/vercel/pull/10369))
