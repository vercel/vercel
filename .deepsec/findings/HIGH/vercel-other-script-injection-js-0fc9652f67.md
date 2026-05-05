# [HIGH] JavaScript injection via client_payload.url in github-script

**File:** [`.github/workflows/comment-cli-tarball.yml`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/.github/workflows/comment-cli-tarball.yml#L52) (lines 52)
**Project:** vercel
**Severity:** HIGH  •  **Confidence:** high  •  **Slug:** `other-script-injection-js`

## Owners

**Suggested assignee:** `cody.wong@vercel.com` _(via last-committer)_

## Finding

Line 52 directly interpolates `${{ github.event.client_payload.url }}` into a JavaScript string literal inside `actions/github-script`: `const deploymentUrl = '${{ github.event.client_payload.url }}';`. The interpolation happens before JS parses, so an attacker-controlled url value containing a single quote (e.g., `https://x.com'; await github.rest.issues.createComment({owner, repo, issue_number: 1, body: process.env.GH_TOKEN}); //`) breaks out of the string and executes arbitrary JS with the workflow's `octokit` client (and access to `process.env` including `GH_TOKEN`/`PYTHON_PACKAGES`). Because the workflow does not declare a `permissions:` block, it uses the repo's default GITHUB_TOKEN permissions — typically write on issues/PRs/contents — meaning injection grants the attacker repo-wide write access via the GITHUB_TOKEN. Combined with the bash-injection on line 25 (which can leak the token to an external host), the dispatch endpoint is a strong RCE/secret-exfiltration vector for any party that controls or compromises the upstream Vercel deployment dispatch.

## Recommendation

Pass the value via an env var: add `DEPLOYMENT_URL: ${{ github.event.client_payload.url }}` to the step `env:` block and read `const deploymentUrl = process.env.DEPLOYMENT_URL || '';` in the script. Validate it begins with `https://` and matches an expected vercel.app pattern before use. Also add an explicit `permissions:` block scoping to only what is needed (`pull-requests: write`).

## Recent committers (`git log`)

- Cody Wong <cody.wong@vercel.com> (2026-04-23)
- Michael J. Sullivan <sully@msully.net> (2026-03-02)
- Ricardo Gonzalez <30984749+ricardo-agz@users.noreply.github.com> (2026-02-24)
- Elvis Pranskevichus <elvis@vercel.com> (2026-02-13)
- Marcos Grappeggia <marcosgrappeggia@gmail.com> (2026-02-12)
