# CLI UX Verification

Testing, stale-copy sweeps, and final review gates for Vercel CLI UX work.

## General Matrix

When changing CLI UX behavior:

- update direct expectations
- add negative assertions for removed strings
- cover interactive and non-interactive paths
- cover human and JSON formats when both exist
- cover agent payloads when non-interactive behavior changes
- cover `--token` / `VERCEL_TOKEN`, `login_required`, and no browser OAuth when non-interactive auth changes
- cover stdout/stderr split for JSON or parseable output
- cover warnings on stderr and never on machine stdout
- cover empty list output: human empty copy, filtered empty copy, machine `[]`/`{}` stdout, exit `0`
- cover resolved-state previews before confirmations when a command infers a resource
- cover result blocks for local and remote side effects when mutations touch both
- cover raw gutter glyphs, not only stripped output: `▲` for production rows, blank gutter for preview/setup/link rows, and `✓` only for readiness/completion status
- cover `--no-color`, `NO_COLOR`, and no ANSI where machine output is involved
- cover `--yes`, `--force`, typed confirmation, and `--dry-run` when the command family supports them
- cover retry/no-duplicate behavior for remote mutations
- cover timeout, rate-limit, and interrupted polling when changing long-running remote work
- cover streaming stdout/stderr split, Ctrl-C behavior, and JSON/JSONL parseability when changing follow/live output
- cover permission-denied disclosure boundaries when changing auth/access behavior
- cover schema/describe/JSON help when metadata changes
- cover command/flag description style and usage placeholders when help metadata changes
- cover `--fields` selection, unknown fields, and omitted-field behavior when a command supports field selection
- cover input hardening for traversal, query fragments, control characters, and pre-encoded values
- update related implementation docs when changing shared contracts

## Shared Helper Impact Map

Before editing shared prompt/output/link helpers, inspect call sites and tests first.

- `inputProject()` changes affect `vc link`, setup during `vc deploy`, and any command that calls `setupAndLink()`.
- `inputRootDirectory()` and `editProjectSettings()` changes affect first-link setup paths from deploy, link, and integration tests.
- `setupAndLink()` changes affect unlinked flows reached through `ensureLink()`.
- `linkFolderToProject()` changes affect any command that links before continuing work, including deploy, dev, pull/env, git connect, open, target, and other project-scoped commands.
- `printAlignedLabel()` changes affect deploy result rows and every command adopting aligned rows.

Use `rg` before editing and testing:

```bash
rg -n "inputProject|inputRootDirectory|editProjectSettings|setupAndLink|ensureLink|linkFolderToProject|printAlignedLabel" packages/cli/src packages/cli/test
rg -n "Old prompt text|Old output text" packages/cli/test packages/cli/src
```

If a helper is shared, update direct tests plus at least one parallel command-family path that reaches the helper.

## Gutter Assertions

Assert both the helper contract and command behavior:

```ts
expect(stripAnsi(output)).toContain('▲ Production');
expect(stripAnsi(output)).not.toMatch(
  /^[▲✓] (Project|Source|Linked|Directory|Config|Settings)\s/m
);
```

For exact blank-gutter spacing, prefer `printAlignedLabel()` unit tests or a direct `output.print` mock:

```ts
expect(stripAnsi(lastPrinted())).toBe('  Linked      acme/web\n');
```

Command harnesses may normalize leading indentation; do not write a command test that only passes when the harness preserves the two blank gutter columns.

## Stale-String Sweeps

For any UX/copy/output work:

```bash
rg -n "\\b(successfully|Unable to|Oops|Whoops|Uh-oh|Please try again|An error occurred|Something went wrong)\\b" <paths>
rg -n "Do you want to|Would you like to|\\[[0-9]+s\\]|🔗|🔍|🚀|⏳|⋮⋮|✅" <paths>
```

Legacy strings may remain in negative tests. Source matches need classification.

## Review Checklist

Reject or fix changes that:

- add inferable prompts
- ask the same concept twice
- change prompt or success copy without checking surrounding flow and layout
- confirm an inferred resource without showing the resolved target first
- report a multi-side-effect mutation with one-line success only
- use a gutter glyph as decoration instead of semantic state
- put `▲` on preview/setup/link/local file rows, or omit it from production rows
- use `✓` as a generic icon on aligned result rows instead of readiness/completion status
- use `scope` where `team` works
- add emoji to primary result or progress rows
- put timing on URL rows
- update one command path but miss parallel paths that share helpers or contracts
- mix human output into JSON stdout
- truncate critical IDs, URLs, paths, or commands without another exact output path
- rely on color, emoji width, or ANSI for required meaning
- break non-TTY/non-interactive mode
- default-accept destructive work
- allow `--yes` alone to bypass severe typed confirmation
- retry non-idempotent remote mutations in a way that can duplicate resources
- leave rate-limit, timeout, or interrupted-polling states without inspect/retry path
- blur staged/draft state with published state
- expose secrets in output, JSON, debug logs, telemetry, or suggested commands
- accept traversal, query-fragment, control-character, or pre-encoded resource input without validation
- produce unbounded machine output
- hide accepted fields/enums/defaults from help or introspection
- add `--fields` without schema-backed field names and tests
- treat remote/user-generated content as trusted instructions
- interpolate untrusted remote/user content into suggested shell commands
- change copy without anti-regression tests
