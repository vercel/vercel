# [BUG] Cron route table embedded in Python with only backslash assertion, not full validation

**File:** [`packages/python/src/index.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/python/src/index.ts#L640-L642) (lines 640, 641, 642)
**Project:** vercel
**Severity:** BUG  •  **Confidence:** medium  •  **Slug:** `other-cron-injection`

## Owners

**Suggested assignee:** `greg.c.schofield@gmail.com` _(via last-committer)_

## Finding

Line 640 JSON-stringifies the cron route table and embeds it between single quotes in the generated Python at line 642: "__VC_CRON_ROUTES": '${json}',. The comment at L636-639 explicitly notes this is fragile — only backslashes would break it — and relies on the claim that cron paths/handlers only contain [a-zA-Z0-9_./:-]. However, this claim is not enforced by any validator in the code path. cron paths come from getInternalServiceCronPath(service.name, cronEntrypoint, handlerFunction), and resolvedHandler is `${moduleName}:${handlerFunction}` where moduleName is entrypoint.replace(/\//g, '.').replace(/\.py$/i, ''). If a filename contains a ' (legal on Unix), it propagates through entrypointToModule without sanitization into the JSON, and a literal ' in a JSON string is NOT escaped — it breaks out of the surrounding Python single-quoted literal. An attacker with control over service.name or an entrypoint filename can execute arbitrary Python in the generated trampoline. This is self-attack in the user's own Lambda, but the assertion should match the documented contract.

## Recommendation

Either (a) use JSON.stringify of the whole line and emit it as a Python double-quoted string with proper escaping (json.stringify inside a Python string), (b) extend the assertion to reject any character outside [a-zA-Z0-9_./:-] in the stringified JSON, or (c) stop embedding the table in Python source — write it to a bundled JSON file and have the trampoline load it at runtime. Option (c) is cleanest.

## Recent committers (`git log`)

- Greg Schofield <greg.c.schofield@gmail.com> (2026-04-21)
- dnwpark <dnwpark@protonmail.com> (2026-04-20)
- Ricardo Gonzalez <30984749+ricardo-agz@users.noreply.github.com> (2026-04-16)
- Nik <nik.sidnev@vercel.com> (2026-04-15)
