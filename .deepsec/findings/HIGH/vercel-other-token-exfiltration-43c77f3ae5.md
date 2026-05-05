# [HIGH] Bot token persisted in `.git/config` is reachable by `npm ci` install scripts and global `npm install -g vercel@latest`

**File:** [`.github/workflows/faster-template-prebuild-nextjs.yml`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/.github/workflows/faster-template-prebuild-nextjs.yml#L14-L32) (lines 14, 15, 16, 27, 32)
**Project:** vercel
**Severity:** HIGH  •  **Confidence:** high  •  **Slug:** `other-token-exfiltration`

## Owners

**Suggested assignee:** `mehul.kar@vercel.com` _(via last-committer)_

## Finding

Line 14-16 checks out the repo using `secrets.VERCEL_CLI_RELEASE_BOT_TOKEN` as the auth token. `actions/checkout@v4` defaults to `persist-credentials: true`, which writes the token into `.git/config` (in the form of an extraheader / basic auth credential). The workflow does NOT set `persist-credentials: false`.

Subsequent steps then execute attacker-reachable code paths:
- L26-28: `npm install -g vercel@latest` — installs the latest published `vercel` CLI from npm, which runs the package's lifecycle scripts during install
- L31-34: `npm ci` in `./examples/nextjs` — installs `next`, `react`, `react-dom`, `eslint`, `tailwindcss` and their entire transitive dependency tree, executing all `preinstall`/`install`/`postinstall` scripts

Any one of those install scripts can read `.git/config` and exfiltrate `VERCEL_CLI_RELEASE_BOT_TOKEN`. Additionally, the steps that run `vc build`/`vc deploy` (L36-50) expose `secrets.NOW_EXAMPLES_VERCEL_TOKEN` and `secrets.NOW_EXAMPLES_VERCEL_ORG_ID` as environment variables to the globally-installed `vercel` CLI, so a compromised npm `vercel@latest` package would receive both tokens directly.

A TODO comment notes that `VERCEL_CLI_RELEASE_BOT_TOKEN` may currently be deleted, but the workflow file is checked in and references the secret — if a new bot token is added under that name (the explicit plan in the TODO), the vulnerability re-emerges.

## Recommendation

1) Add `persist-credentials: false` to the `actions/checkout` step so the bot token is not written into `.git/config`.
2) Pin the vercel CLI (e.g., `npm install -g vercel@<specific-version>`) instead of `@latest`.
3) Pin `actions/checkout@v4` and `actions/setup-node@v4` to commit SHAs.
4) Add an explicit `permissions:` block (e.g., `permissions: contents: read`).
5) Consider not using the bot token for checkout at all — the default GITHUB_TOKEN is sufficient for a public repo's checkout. The bot token only seems to be needed in cron workflows that push branches.

## Recent committers (`git log`)

- Mehul Kar <mehul.kar@vercel.com> (2026-04-20)
- Thomas Knickman <tom.knickman@vercel.com> (2026-03-11)
- Trek Glowacki <trek.glowacki@vercel.com> (2024-12-09)
