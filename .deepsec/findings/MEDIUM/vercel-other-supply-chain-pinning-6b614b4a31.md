# [MEDIUM] Inconsistent action pinning: official GitHub actions use mutable major-version tags

**File:** [`.github/workflows/validate-binary.yml`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/.github/workflows/validate-binary.yml#L47-L159) (lines 47, 52, 68, 159)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-supply-chain-pinning`

## Owners

**Suggested assignee:** `amokstakov@gmail.com` _(via last-committer)_

## Finding

The workflow inconsistently pins GitHub Actions. Third-party actions are properly SHA-pinned with version comments (e.g., `oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2`, `dtolnay/rust-toolchain@e081816240890017053eacbb1bdf337761dc5582 # 1.95.0`, `astral-sh/setup-uv@eac588ad8def6316056a12d4907a9d4d84ff7a3b # v7.3.0`), demonstrating awareness of pinning best practices. However, the official GitHub-owned actions are pinned only to mutable major version tags: `actions/checkout@v4` (line 47), `actions/setup-node@v4` (line 52), `actions/setup-python@v6` (line 68), and `actions/upload-artifact@v4` (line 159). Major version tags can be force-moved by maintainers or by an attacker who compromises maintainer credentials, which would inject malicious code into every workflow run that resolves the tag. Because this workflow runs with secrets access (SENTRY_DSN) and write access to GitHub Releases (in the sibling release-binary.yml workflow), a compromised action could exfiltrate secrets or tamper with built/published binaries. GitHub's own hardening guide recommends SHA-pinning all actions for defense-in-depth, regardless of publisher.

## Recommendation

Pin all actions, including official GitHub-owned ones, to a full commit SHA with a version comment, matching the style already used for third-party actions. For example: `uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11 # v4.1.1`. Use Dependabot's `package-ecosystem: github-actions` configuration to keep these SHAs current automatically.

## Recent committers (`git log`)

- melkeydev <amokstakov@gmail.com> (2026-05-01)
