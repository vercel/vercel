---
'@vercel/cli-auth': minor
'@vercel/cli-config': minor
'@vercel/oidc': minor
'vercel': minor
---

Add configurable credentials storage handling across the CLI auth stack.  Storage of credentials can be configured by the new `credsStorage` key in global `config.json` or the new `VERCEL_TOKEN_STORAGE` environment variable.  The environment variable takes precedence over the configuration key.  Accepted values are `file` (store credentials in `auth.json`), `keyring` (store credentials in system keyring, e.g macOS Keychain or Secrets Service on Linux), and `auto` (try storing in keyring if available, fall back to `file` if keyring is not avaiable).

`@vercel/oidc` supports keyring-stored authentication credentials by delegating the OIDC minting to the CLI executable via `@vercel/cli-exec`.
