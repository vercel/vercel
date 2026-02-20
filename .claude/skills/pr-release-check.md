# PR Release Check

Check if a vercel/vercel PR is included in a published CLI release.

**Auto-activates when:** user asks "is PR released", "was this PR shipped", "is #1234 in a release", "which release has my PR", or similar questions about whether a PR has been released.

## Usage

The user provides a PR number or GitHub PR URL. Extract the PR number and run the steps below.

## Steps

### 1. Fetch PR info

```bash
gh pr view <PR_NUMBER> --repo vercel/vercel --json title,state,mergeCommit,mergedAt
```

Report the PR title, state, merge commit SHA, and merge date.

If the PR is not in `MERGED` state, stop and report: "Not merged yet — not in any release."

### 2. Get the latest CLI release

```bash
gh release list --repo vercel/vercel --limit 50 | grep "^vercel@" | head -1 | awk '{print $1}'
```

Report the latest release tag.

### 3. Check if the merge commit is in the latest release

```bash
git merge-base --is-ancestor <MERGE_SHA> <LATEST_TAG>
```

If exit code is non-zero, the PR is **NOT YET RELEASED** — report that and stop.

### 4. Find the first release containing the commit

Collect all recent CLI release tags sorted by semver:

```bash
gh release list --repo vercel/vercel --limit 100 | grep "^vercel@" | awk '{print $1}' | sort -t@ -k2 -V
```

Then iterate through them in order, checking each with:

```bash
git merge-base --is-ancestor <MERGE_SHA> <TAG>
```

The first tag where this succeeds is the first release containing the PR.

### 5. Report results

Format output as:

```
PR:     #<number> — <title>
State:  MERGED
Merged: <date>
Commit: <sha>

Latest: vercel@<latest_version>

Status: RELEASED
First:  vercel@<first_version>
```

If the first release is also the latest, note that. If the commit is in the latest but you can't determine the first release from recent tags, say so.

## Notes

- Accept both PR numbers (`1234`) and full URLs (`https://github.com/vercel/vercel/pull/1234`)
- For URLs, extract the number from the `/pull/<number>` path
- This must be run from within the vercel/vercel repo (needs git history for `merge-base`)
- Make sure tags are fetched locally — if `merge-base` fails, try `git fetch --tags` first
