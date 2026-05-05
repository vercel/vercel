# [MEDIUM] Inadequate value escaping in escapeValue enables shell injection when .env is sourced

**File:** [`packages/cli/src/commands/env/pull.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/cli/src/commands/env/pull.ts#L269-L308) (lines 269, 302, 303, 304, 305, 306, 307, 308)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `other-env-injection`

## Owners

**Suggested assignee:** `elvis@vercel.com` _(via last-committer)_

## Finding

`escapeValue` (line 302–308) only escapes `\n` and `\r` characters in env var values before writing them to the .env file at line 269: `${key}="${escapeValue(records[key])}"`. Critically, it does NOT escape `"` or `\`, so env var values containing these characters break the surrounding quoting in the generated file.

**Threat model:** A team member with env var write access (e.g., `developer` role, often broader than admin) can set malicious values that affect anyone who pulls. The `validate-env.ts` warnings for control characters are non-blocking (the user can pass `--yes` or just leave-as-is), and there's no warning for `"` or `\` characters at all.

**Attack 1 — Shell-source injection:** Many developers source the .env file into their shell via `set -a; source .env` or similar. If a teammate sets a value to ``";export ADMIN_TOKEN=\"hijacked``, the resulting line is `MY_KEY="";export ADMIN_TOKEN="hijacked"`. When sourced, the shell parses this as TWO statements separated by `;` — assigning MY_KEY to empty AND exporting ADMIN_TOKEN. This lets a low-privileged team member silently inject env vars (e.g., overriding `AWS_PROFILE`, `npm` config, `PATH`, etc.) into a higher-privileged teammate's shell.

**Attack 2 — Trailing-backslash data eating:** A value ending in `\` produces `KEY="value\"`. Most dotenv parsers interpret `\"` as an escaped quote within the string and continue reading, consuming the next env var line into KEY's value. This corrupts subsequent variables.

**Attack 3 — Embedded `"`:** A value containing `"` breaks the .env line's quoting, causing dotenv parsers to see the wrong value and any text after the embedded quote as garbage on the same line.

The `createEnvObject` helper (in diff-env-files.ts) reflects awareness of this fragility — it strips all `"` chars before parsing. But that's only used for the delta diff; the file as written is still consumed by external parsers (dotenv, Next.js, Python's dotenv, shell sourcing) which behave very differently.

## Recommendation

Properly escape all special characters in `escapeValue`. At minimum, escape `\` (to `\\`) BEFORE other replacements, and escape `"` (to `\"`). Order matters: `value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r')`. Better: use a battle-tested .env-format library to serialize. Additionally, server-side validation should reject or warn loudly on values containing `"` or trailing `\` for environments that use `vercel env pull`.

## Recent committers (`git log`)

- Elvis Pranskevichus <elvis@vercel.com> (2026-04-30)
- Felix Haus <472867+ofhouse@users.noreply.github.com> (2026-04-03)
- Thomas Knickman <tom.knickman@vercel.com> (2026-03-11)
- Marcos Grappeggia <marcosgrappeggia@gmail.com> (2026-03-10)
- Brooke <25040341+brookemosby@users.noreply.github.com> (2026-02-20)
