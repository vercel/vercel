# [MEDIUM] Unpinned third-party action references and `npm install -g corepack@latest`

**File:** [`.github/workflows/cron-update-next-canary.yml`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/.github/workflows/cron-update-next-canary.yml#L15-L24) (lines 15, 20, 24)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** low  •  **Slug:** `other-supply-chain`

## Owners

**Suggested assignee:** `mehul.kar@vercel.com` _(via last-committer)_

## Finding

The workflow references `actions/checkout@v4` (L15) and `actions/github-script@v7` (L24) by floating major version tag rather than commit SHA. If these actions were ever compromised or had a malicious tag pushed, the next scheduled run (every 10 minutes) would automatically execute the malicious code with access to `secrets.NPM_TOKEN` and `secrets.VERCEL_CLI_RELEASE_BOT_TOKEN`. Similarly, `npm install -g corepack@latest` (L20) installs the latest published version of corepack with no integrity check. Although these packages are from trusted publishers (GitHub's `actions` org and Node.js team), pinning to SHA / specific versions is the recommended hardening for security-sensitive workflows that have access to secrets capable of pushing branches or creating PRs in the repository.

## Recommendation

Pin actions to a full commit SHA (e.g., `actions/checkout@<sha> # v4.x.y`) and use Dependabot to update them. Replace `corepack@latest` with a pinned version. Add a `permissions:` block at the workflow or job level to restrict the default GITHUB_TOKEN scope (e.g., `permissions: contents: read`).

## Recent committers (`git log`)

- Mehul Kar <mehul.kar@vercel.com> (2026-04-20)
- Thomas Knickman <tom.knickman@vercel.com> (2026-03-11)
- Austin Merrick <onsclom@onsclom.net> (2025-03-04)
- Sean Massa <EndangeredMassa@gmail.com> (2025-02-10)
