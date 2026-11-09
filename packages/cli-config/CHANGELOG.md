# @vercel/cli-config

## 0.3.4

### Patch Changes

- bcdc735: Run the one package each platform maps to: the native binary on macOS and Linux x64/arm64, and `@vercel/cli-support` on Windows and every other platform. The native binary is now the default; for this release `VERCEL_CLI_USE_NATIVE_BINARY=0` or a persisted `useNativeBinary: false` still opts out. `nativeBinaryAutoOptIn` and `vercel upgrade --enable-binary`/`--disable-binary` are removed. `vercel` falls back to its own JS CLI only when that package is missing, the binary cannot start, or the user opted out, and records the `launcher`, `launcher_target`, and `launcher_fallback` telemetry events when it does. `@vercel/cli-support` now installs on every OS except macOS and Linux, and the architecture deprecation warning is limited to Linux.

## 0.3.3

### Patch Changes

- b0e01f5: First-time users of the CLI now get one offer to install the Vercel plugin for Claude Code and Codex, `Install Vercel Plugin for coding agents? (Y/n)`, after their first successful command in an interactive terminal. It only appears when Claude Code or Codex is installed without the plugin. Agents, CI, `--json`, `--non-interactive`, and runs without a terminal never see it and never wait on it, and an unanswered prompt is skipped after 30 seconds. The answer is saved, and the CLI doesn't ask again. A new config marks a first-time user with `"usedBefore": false` in `config.json`; configs from earlier releases count as used, so existing users aren't asked.

  `vercel env`, `vercel project`, and `vercel pull` no longer check or offer the Claude Code plugin after they finish, so they no longer run `claude plugins list` or download the plugin's version file.

  Installing the plugin for Claude Code (from the offer or `vercel setup plugin`) now adds the official `claude-plugins-official` marketplace first when Claude Code doesn't have it yet, as on a fresh install, instead of failing. An install that gets an older version than the Vercel plugin repository's main branch, because the marketplace hasn't published it yet, is now reported as installed instead of failed. For Codex, setup now says to sign in with ChatGPT (`codex login`) when Codex can't reach the OpenAI plugin marketplace because it isn't signed in with ChatGPT.

## 0.3.2

### Patch Changes

- 637c7b9: Add `vercel whoami --cached`, which prints your username from the last time the CLI looked up your account, without contacting Vercel, including when a scope is set with `--scope` or `vercel.json`. The CLI now saves the username in `auth.json` together with the user ID it belongs to, and only uses it while that ID is the logged-in user, so logging in with cli-go or another recent CLI version doesn't make it print the wrong account. When no username is saved for the current user, or the saved session has expired and can't be refreshed, `--cached` asks Vercel as before, and its `--json` output then includes `"cached": false`. The saved name can be out of date, so scripts that need to confirm the login still works should keep using `vercel whoami`.

  `vercel whoami` with piped output, which prints only the username, no longer looks up the current team, so it makes one request instead of two. It also no longer fails when the saved team was deleted or you lost access to it: it prints your username and exits `0`. Terminal and `--json` output still look up the team and report the error.

## 0.3.1

### Patch Changes

- 85cfdc3: Fixed a typo ("configration" → "configuration") in the `@vercel/cli-config` README.

## 0.3.0

### Minor Changes

- c610f14: Restore automatic native CLI enrollment for Vercel team members, keeping automatic enrollment separate from explicit preferences. Preserve explicit opt-outs and allow npm-installed CLI users to disable native execution even when the native binary cannot start.

## 0.2.7

### Patch Changes

- c4c4f3f: Install the exact latest Vercel CLI version during foreground upgrades, while automatic upgrades leave `@latest` unpinned so package managers apply minimum release-age settings without prompting, bypassing policy, or downgrading. Support explicit version targets, and offer a choice between installing the newest release allowed by package manager settings or persisting minimum release-age bypass consent for npm and pnpm. Explain the configured minimum release age, including pnpm 11+'s implicit 24-hour default, in interactive and non-interactive failures. Resolve metadata using the detected global installation configuration for npm, pnpm, Yarn, and Bun; use the environment and temporary directory captured at startup so project dotenv values cannot alter update executables or working directories; and reject local, unknown, and vlt-managed installations with actionable guidance instead of assuming global npm. Keep dry-run and JSON previews free of settings mutations, and save explicit bypass consent even when already up to date. Preserve the completed command's exit code if optional update notifications or automatic updates throw. Handle npm 12's JSON metadata arrays and verify real global installation, detection, upgrade, release-age rejection, and bypass using the preview CLI with pinned npm and pnpm versions, while covering Yarn and Bun command construction and detection deterministically.

## 0.2.6

### Patch Changes

- 55e8d1e: Reduce CLI startup and deployment preparation time through lazy shared dependencies, smaller bundles, parallel Git metadata and file collection, and native executable startup caching. Allow deployment options to resolve asynchronously while the client collects local files.

  Keep startup regression tests compatible with asynchronous prompts and Windows Git paths, and allow the NestJS build fixture sufficient time for cold dependency installation.

## 0.2.5

### Patch Changes

- 38a4acd: Use a vlt-based importer for release-pinned Builders in native CLI installations, storing materialized installations in the platform cache directory.

## 0.2.4

### Patch Changes

- 7a3a2ef: Store native CLI versions and executable shims in the platform application-data directory instead of `~/.vercel`.

## 0.2.3

### Patch Changes

- 92dfd87: Load `xdg-app-paths` only when resolving the global CLI config directory.

## 0.2.2

### Patch Changes

- 6d7fbfa: Bump all workspace packages to trigger a full publish from vercel-internal.

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
