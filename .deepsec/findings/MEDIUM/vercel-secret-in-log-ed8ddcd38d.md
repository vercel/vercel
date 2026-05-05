# [MEDIUM] User-supplied --value secret echoed back in non-interactive JSON output

**File:** [`packages/cli/src/commands/env/add.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/cli/src/commands/env/add.ts#L90-L336) (lines 90, 91, 282, 287, 296, 305, 311, 317, 324, 336)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `secret-in-log`

## Owners

**Suggested assignee:** `53410236+Melkeydev@users.noreply.github.com` _(via last-committer)_

## Finding

When `add.ts` runs in non-interactive mode and detects missing requirements (e.g., missing name or environment), it builds suggested-next-command strings and writes them to stdout as JSON via `outputActionRequired`. The actual `valueFromFlag` (i.e. the value supplied via `--value`) is interpolated into these command strings via `fillEnvAddTemplate(...)` (lines 90-91, 282-287, 305-312). Specifically, `filledTemplate`, `branchSpecific`, and `branchAll` all contain the literal secret value, and they appear in `next[].command` and the `message` field (line 336) written to stdout. Example attack-relevant scenario: a user (or CI/agent) runs `vercel env add --value 'supersecret' --yes` without a name. The CLI emits a JSON payload to stdout that contains `--value supersecret` inside multiple `next[].command` entries plus the `message`. Because the user authentication flag `--token` is intentionally redacted by `stripSensitiveAuthArgs` (see `packages/cli/src/util/redact-args.ts`), the original design clearly recognizes that argv contents can be sensitive and need redaction in suggested-command echoes. `--value` is omitted from this redaction list, so the secret is echoed verbatim. This duplicates the secret into stdout, where CI/CD log aggregators and AI-agent JSON parsers commonly capture, store, and forward the output even when shell history or `ps` output is masked. The `update.ts` counterpart uses literal `<value>` placeholders (e.g. line 128) and does NOT have this leak, evidencing the inconsistency.

## Recommendation

Do not interpolate the actual `valueFromFlag` into suggested-next-command strings. Either (a) always use the literal `<value>` placeholder when constructing `filledTemplate`, `branchSpecific`, and `branchAll` regardless of whether `valueFromFlag` was supplied, or (b) extend `stripSensitiveAuthArgs` (or add a separate redactor) to strip `--value`/`--value=` from any argv that becomes part of agent JSON output, and have `fillEnvAddTemplate` emit `<value>` instead of the supplied content. Mirror the approach already used in `update.ts` where templates always use `<value>`.

## Recent committers (`git log`)

- MelkeyDev <53410236+Melkeydev@users.noreply.github.com> (2026-04-20)
- Jeff See <jeffsee.55@gmail.com> (2026-04-19)
- Thomas Knickman <tom.knickman@vercel.com> (2026-03-05)
- Brooke <25040341+brookemosby@users.noreply.github.com> (2026-02-20)
- John Pham <johnphammail@gmail.com> (2026-01-22)
