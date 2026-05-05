# [MEDIUM] Env var value prompted with unmasked text input (inconsistent with `env add`)

**File:** [`packages/cli/src/commands/env/update.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/cli/src/commands/env/update.ts#L447-L459) (lines 447, 459)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `other-unmasked-secret-input`

## Owners

**Suggested assignee:** `jeffsee.55@gmail.com` _(via last-committer)_

## Finding

When the user runs `vercel env update <name>` interactively without supplying `--value` or stdin, the CLI prompts for the new value using `client.input.text({...})` (line 447), and the validation re-entry path also uses `client.input.text(...)` (line 459). This causes the value to be displayed in plaintext on the terminal as the user types, leaving it in terminal scrollback, screen recordings, and visible to shoulder-surfers. By contrast, `packages/cli/src/commands/env/add.ts` correctly uses `client.input.password({ message, mask: true })` (lines 614, 625) for the same operation. Environment variable values frequently contain credentials (API keys, DB passwords, OAuth secrets), so masking is the expected behavior. The inconsistency is a security UX defect — users updating a sensitive variable reasonably expect masking parity with `add`. Note also that the existing variable's `type` (which can be `sensitive`) is preserved during update (line 496), confirming that update flows commonly target genuinely sensitive values.

## Recommendation

Replace `client.input.text(...)` with `client.input.password({ message: ..., mask: true })` at both lines 447 and 459, mirroring how `add.ts` handles env value entry. Consider extracting a shared helper used by both `env add` and `env update` so the masking decision is centralized.

## Recent committers (`git log`)

- Jeff See <jeffsee.55@gmail.com> (2026-04-20)
- MelkeyDev <53410236+Melkeydev@users.noreply.github.com> (2026-04-20)
- Thomas Knickman <tom.knickman@vercel.com> (2026-03-05)
- Brooke <25040341+brookemosby@users.noreply.github.com> (2026-02-20)
- John Pham <johnphammail@gmail.com> (2026-01-22)
