# [MEDIUM] Checkout uses attacker-controlled SHA from client_payload

**File:** [`.github/workflows/comment-cli-tarball.yml`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/.github/workflows/comment-cli-tarball.yml#L35-L41) (lines 35, 41)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-checkout-attacker-ref`

## Owners

**Suggested assignee:** `cody.wong@vercel.com` _(via last-committer)_

## Finding

Line 35 `ref: ${{ github.event.client_payload.git.sha }}` checks out a commit chosen by whoever sends the repository_dispatch payload. While checkout will only succeed for SHAs that exist in the repository (a fork PR could push a commit referenced by SHA into the repo via the PR mechanism), it still allows the dispatcher to select any historical commit (including ones predating security fixes) and run subsequent steps against that tree. Then line 41 executes `node utils/get-python-packages.js` from that tree — meaning the dispatcher selects which version of the helper script runs. Combined with the bash/JS injection points above, this widens the impact.

## Recommendation

Verify that `client_payload.git.sha` corresponds to a commit reachable from the PR head (e.g., reject if it is not in the open PR's commit history) before checkout. Alternatively, pin to `github.sha` or the PR head SHA fetched from the GitHub API rather than trusting payload-supplied data.

## Recent committers (`git log`)

- Cody Wong <cody.wong@vercel.com> (2026-04-23)
- Michael J. Sullivan <sully@msully.net> (2026-03-02)
- Ricardo Gonzalez <30984749+ricardo-agz@users.noreply.github.com> (2026-02-24)
- Elvis Pranskevichus <elvis@vercel.com> (2026-02-13)
- Marcos Grappeggia <marcosgrappeggia@gmail.com> (2026-02-12)
