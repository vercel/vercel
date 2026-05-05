# [HIGH] Indirect execution of `npx --yes create-next-app@latest` exposes secrets to a third-party package

**File:** [`.github/workflows/cron-update-next-latest.yml`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/.github/workflows/cron-update-next-latest.yml#L15-L30) (lines 15, 22, 24, 25, 28, 30)
**Project:** vercel
**Severity:** HIGH  •  **Confidence:** high  •  **Slug:** `other-supply-chain`

## Owners

**Suggested assignee:** `mehul.kar@vercel.com` _(via last-committer)_

## Finding

This workflow loads `./utils/update-next.js` via `actions/github-script@v7` with `tag: 'latest'`. For the `latest` tag, `update-next.js` calls `updateExamples()` which executes `npx --yes create-next-app@latest` (utils/update-next.js:137). This downloads and runs the latest published version of `create-next-app` (and its transitive postinstall scripts) inside the Actions runner with the following secrets in scope:

- `NODE_AUTH_TOKEN` = `secrets.NPM_TOKEN`
- `GITHUB_TOKEN` = `secrets.VERCEL_CLI_RELEASE_BOT_TOKEN`
- The default `${{ github.token }}` persisted in `.git/config` by `actions/checkout` (L15) — this token has push access since `update-next.js` later runs `git push origin <branch>`

A compromise of the npm registry, the `create-next-app` package, OR any of its transitive dependencies would result in immediate exfiltration of these secrets and the ability to push arbitrary commits / open PRs against this repo. The release bot token in particular has elevated privileges (it is used to request reviewers and label PRs that the auto-generated GITHUB_TOKEN may not be able to). The cron schedule (every 4 hours) means the attack window is short.

## Recommendation

Avoid `npx ... @latest` patterns in workflows that have access to release tokens. Either (a) pin `create-next-app` to a specific version, (b) move the `npx create-next-app` step to an isolated job that has NO access to the release bot token / npm token (use job-level secrets), or (c) regenerate the example via a script that doesn't fetch from the npm registry. Additionally set `permissions: contents: read` and consider `persist-credentials: false` on checkout, then provide a separate token only for the push step.

## Recent committers (`git log`)

- Mehul Kar <mehul.kar@vercel.com> (2026-04-20)
- Thomas Knickman <tom.knickman@vercel.com> (2026-03-11)
- Sean Massa <EndangeredMassa@gmail.com> (2025-02-10)
