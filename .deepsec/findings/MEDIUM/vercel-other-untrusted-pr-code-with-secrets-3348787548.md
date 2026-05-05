# [MEDIUM] Untrusted PR code executed with --no-frozen-lockfile and access to secrets

**File:** [`.github/workflows/cli-evals.yml`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/.github/workflows/cli-evals.yml#L27-L76) (lines 27, 38, 46, 48, 49, 50, 51, 52, 53, 74, 75, 76)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-untrusted-pr-code-with-secrets`

## Owners

**Suggested assignee:** `bhrigu.srivastava@vercel.com` _(via last-committer)_

## Finding

The workflow uses the `pull_request` trigger with `paths: packages/cli/evals/**`. On line 27 it checks out the PR head SHA directly (not a merge commit), then on line 38 runs `pnpm install --no-frozen-lockfile`, then on line 46 executes `pnpm test:evals` with secrets (EVAL_AI_GATEWAY_API_KEY, EVAL_TOKEN, EVAL_TEAM_ID, EVAL_PROJECT_ID, VERCEL_AUTOMATION_BYPASS_SECRET, EVALS_INGEST_TOKEN, EVALS_INGEST_URL) injected as env vars. While GitHub by default does not expose secrets to fork PRs, same-repo branch PRs do receive these secrets. The combination of `--no-frozen-lockfile` (allowing PR-supplied package.json/lockfile changes to install arbitrary dependencies, including ones with malicious postinstall scripts) and direct execution of PR-controlled test code with secret env vars expands the attack surface for a malicious internal contributor or compromised account. A PR could add a dependency whose postinstall exfiltrates EVAL_TOKEN/VERCEL_AUTOMATION_BYPASS_SECRET to an attacker-controlled host.

## Recommendation

Either: (a) move evals to `pull_request_target` with explicit allow-list of who can trigger and avoid checking out untrusted code, (b) use `--frozen-lockfile` to prevent dependency tampering, (c) split secret-bearing steps from PR-code execution so secrets are not in scope when running PR-supplied code, or (d) require manual approval before running on PRs.

## Recent committers (`git log`)

- Bhrigu Srivastava <bhrigu.srivastava@vercel.com> (2026-04-01)
- Jeff See <jeffsee.55@gmail.com> (2026-03-13)
- Michael J. Sullivan <sully@msully.net> (2026-03-02)
- Brooke <25040341+brookemosby@users.noreply.github.com> (2026-02-27)
