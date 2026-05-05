# [MEDIUM] Path traversal in saveToken/loadToken via unvalidated projectId

**File:** [`packages/oidc/src/token-util.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/oidc/src/token-util.ts#L162-L177) (lines 162, 164, 177)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `path-traversal`

## Owners

**Suggested assignee:** `39992+gr2m@users.noreply.github.com` _(via last-committer)_

## Finding

`saveToken(token, projectId)` and `loadToken(projectId)` construct a file path via `path.join(dir, 'com.vercel.token', `${projectId}.json`)` without validating that `projectId` doesn't contain path-traversal sequences. Because `path.join` resolves `..` segments, a `projectId` like `'../../malicious'` would cause writes/reads outside the user data directory. `saveToken` additionally calls `fs.mkdirSync(path.dirname(tokenPath), { mode: 0o770, recursive: true })` which would create attacker-controlled directory hierarchies on the user's filesystem with group-writable permissions. `projectId` originates from either (a) the public-facing `options.project` parameter callers can set freely, or (b) a `.vercel/project.json` file inside the user's working directory — meaning a malicious project repository could include a crafted `project.json` and cause arbitrary file writes when the user runs OIDC token refresh inside that directory. Impact is limited (file content is `{"token": "..."}`) but includes overwrite of attacker-known paths and unintended directory creation with 0o770 permissions.

## Recommendation

Validate `projectId` matches an expected format (e.g., `/^prj_[A-Za-z0-9]+$/` or alphanumeric+slug-safe characters only) before using it in any path construction. Alternatively, use `path.basename(projectId)` to strip path components, or assert that the resolved path is contained within the expected base directory.

## Recent committers (`git log`)

- Gregor Martynus <39992+gr2m@users.noreply.github.com> (2026-02-10)
- Alice <105500542+alice-wondered@users.noreply.github.com> (2026-01-05)
- Casey Gowrie <casey.gowrie@vercel.com> (2025-11-19)
