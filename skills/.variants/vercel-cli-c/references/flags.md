# Feature Flags

`vercel flags` manages [Vercel Flags](https://vercel.com/docs/flags/vercel-flags) — create, inspect, update, set, enable, disable, archive, and delete feature flags, plus manage SDK keys. Run `vercel flags --help` and `vercel flags <subcommand> --help` for flags and subcommands; this file covers behavior that help output cannot tell you.

## Flag Kinds and Variants

Flag kinds: `boolean` (default), `string`, `number`, `json`. Boolean flags get `true`/`false` variants automatically at creation; declare variants explicitly (repeatable `--variant VALUE[=LABEL]`) for the other kinds. JSON variant values must be valid JSON literals (objects, arrays, strings, etc.).

## Variant Resolution (Common Pitfall)

Everywhere a command accepts a variant (`set --variant`, `enable`/`disable --variant`, `split --weight VARIANT=WEIGHT`, `rollout --from-variant`/`--to-variant`), the variant resolves by **ID or value, never by label**. Default boolean flags have values `true`/`false` with labels `On`/`Off` — labels don't resolve, so pass `false`/`true` rather than `off`/`on`. Passing `--variant off` is rejected unless `off` is a variant's literal value or ID (i.e., the flag was created with explicit `off`/`on` variants).

## Environment Targeting

`set`, `enable`, `disable`, `split`, and `rollout` operate per environment (`production`, `preview`, `development`). Omitting `-e` prompts interactively — always pass it in scripts and agents. `enable`/`disable` are boolean-only shortcuts that set the served variant to `true`/`false`; they do not work on string, number, or json flags (use `set`).

## Listing and Pagination

`flags list` returns every flag by default. Pass `--limit` for a single page; the command prints a ready-to-run `--next <cursor>` command for the following page, and `--json` output includes `pagination.next`.

## Archive / Delete

A flag must be archived (`flags archive`) before it can be deleted (`flags rm`).

## Build and Testing Helpers

- `flags prepare` is for build pipelines: it prepares flag definition fallbacks so the deployed app has a fallback value for every flag.
- `flags override` encrypts flag overrides into a secure token for the `vercel-flag-overrides` cookie (decrypt with `--decrypt`) — useful for testing variants without changing served defaults.

## SDK Keys

SDK keys authenticate your application when evaluating flags. The full key value is only shown at creation time (`flags sdk-keys add`) — `sdk-keys ls` will not reveal it again.
