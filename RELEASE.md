# CLI and package releases

A frozen version PR is tested and reviewed. Merging it approves releasing its
exact head commit **H**. **Manual Version Packages** (a trusted main run) builds H
while the PR is in review, and the release workflow publishes those files after
merge. Nothing is built from current main.

## Prepare and approve

1. Merge changesets into main, then start **Manual Version Packages**:

   ```sh
   gh workflow run version-packages.yml --ref main
   ```

2. Preparation snapshots main, versions packages, and creates or refreshes the
   draft PR on `manual-version-packages`. Other main merges leave it alone. The
   same run then builds H for release (see below) and reports **Release build
   ready** on H.
3. Close and reopen the draft to start **Tests** and **Frozen version candidate**.
   Approve the Actions run if GitHub asks. Preparation uses `GITHUB_TOKEN`, so
   starting CI may require this maintainer action.
4. Wait for normal CI and **Release build ready**, review the version diff, and
   squash-merge the PR. The merge
   is release approval. After testing `vercel@canary`, a separate manual
   promotion moves `vercel` to `latest` (see below).

Do not use **Update branch** or push changes onto the candidate. Run preparation
again to include newer main changes; the new head needs new CI and review.

## Release build (before merge)

After creating the PR, Manual Version Packages builds H in the same run, in
parallel with PR CI and review. These jobs are read-only: no registry
credentials, release environment, or writes.

- **Build:** reuse the candidate package and binary workflows for H, without the
  shared Turborepo remote cache that PR jobs write to. All eight binaries build at
  once. Python distributions are built and wheel-tested. The `@vercel/cli-support`
  fallback is generated from the exact `vercel` tarball.
- **Sign:** macOS binaries are signed and notarized immediately after they are
  built, in jobs using the `code-signing` environment. PR builds stay unsigned.
- **Assemble:** one Linux job combines all eight binaries, reuses the native npm
  stager, and packs native packages with scripts disabled. Built package tarballs
  are copied unchanged.
- **Save:** final npm tarballs, Python distributions, binary assets/checksums, and
  release-note data are saved as `release-payloads-<H>-attempt-<n>` (30 days).
- **Check:** each binary is smoke-tested where it is built (musl in Alpine; macOS
  again after signing). Credential-free native Builder checks then run
  `vercel build` with the final Linux binaries, including as root in Alpine and
  Debian.
- **Release build ready:** a commit status on H; success only after assembly and
  the native Builder checks pass. If it fails, use **Re-run failed jobs** in that
  preparation run; Tests and Frozen version candidate only check that run's
  `version` job in the attempt H records, so the rerun doesn't invalidate H. It is
  informational, not a required check: branch protection cannot require it only
  for the version PR, and ordinary PRs never receive it. Merging before it passes
  is safe; the release stops at selection until the build succeeds, then you
  re-run the release.

## What merging does

`release.yml` runs on main pushes. Ordinary merges do nothing. For a merged
version PR it reads the PR's exact head **H**, takes the preparation run ID from
H's committed `.release-candidate.json`, and checks that run is
**Manual Version Packages** dispatched on main from H's parent and succeeded. It
copies that run's payloads into the release run and publishes them; nothing is
rebuilt, and PR CI artifacts are never used. If the build is still running or
failed, the release stops; finish or rerun the preparation run, then re-run the
release. If **M** changes `.release-plan.json` but GitHub has not linked the
version PR yet, the run fails instead of skipping; rerun it.

- **Publish:** `release.yml` / environment `release` keeps the existing npm and PyPI
  trusted-publisher identity. `vercel` is published to `canary` and waits for
  promotion. Other stable packages go straight to `latest`, unless that would move
  `latest` backward (then `release-H`); prereleases use `canary`. Native npm
  dependencies publish first, other packages keep pnpm order from H, and `vercel`
  publishes last. Python releases are live once published.
- **Finish:** native npm acceptance runs when this release published the CLI. Package
  tags and GitHub releases point to H, but no GitHub release is marked latest yet.
  Existing tags and assets are not replaced.

## Promote to latest

After testing `vercel@canary`, promote it:

```sh
gh workflow run release.yml --ref main -f release-run=<successful Release run ID>
```

Promotion waits for `release` environment approval, then reads the saved npm
manifest from that run. It refuses to continue unless npm has the exact saved
`vercel` tarball, then moves `latest` to that version. It never moves `latest`
backward and never promotes prereleases. It then marks the `vercel` GitHub release
latest and publishes CLI release notes. Rerunning promotion is safe.

To stop a bad release, do not promote it. Only `vercel` waits: the native
platform packages, `@vercel/vc-native`, `@vercel/cli-support`, other npm
packages, and Python are live once published. Installing `vercel@latest` still
resolves its own older exact-version native dependencies.

## Retries

Release runs never rebuild. **Re-run failed jobs** or **Re-run all jobs** copies
the preparation run's newest payloads again. Those are the same bytes unless
someone reran `assemble` in the preparation run in between; then the `vercel`
checksum check fails instead of publishing different bytes, and other packages
already on npm are skipped.

A new preparation run (a refresh) builds a new H. Payloads expire after 30 days;
an older candidate needs a fresh preparation run.

- Existing versions are skipped. For `vercel` only, npm's `dist.integrity` must
  match the saved tarball, or publication fails; promotion and acceptance depend
  on it. Other npm and PyPI packages are an existence check only.
- Only a real registry 404 means absent. Authentication, network, and other lookup
  failures stop publication. A failed npm write gets one version lookup, not an
  automatic mutation retry; if the version now exists it is treated like an
  existing version.
- Skipped versions are not retagged.
- When `vercel` already exists with the saved bytes, it counts as this release:
  native acceptance, promotion, and release notes still run.

A code defect requires a new version, not a retry.

## Cutover checklist (repository administration)

The code change replaces the legacy updater, fabricated `Summary` status, main
rebuild publisher, verification-only dispatch, and manual source-building Python
publisher in one change. The existing `release` and `code-signing` environments
remain; do not change registered workflow names gratuitously.

Before enabling the first release:

1. Let any running legacy publication finish and clear queued legacy Release runs.
   Rerunning an old run uses its old workflow definition, even after this PR merges.
2. Require **Frozen version candidate** alongside **Summary**, retaining existing
   Vercel/CODEOWNER/signed-commit requirements. Enable stale-review dismissal or
   approval of the most recent push so refreshing the candidate needs fresh review.
   These are GitHub settings, not settings a workflow file changes automatically.
3. Confirm `code-signing` and `release` permit only the intended main release jobs,
   and npm/PyPI still trust `release.yml` with environment `release`. This
   includes `@vercel/cli-support`; candidate `vercel` tarballs depend on it.
   Enable **Allow npm dist-tag** on the `vercel` trusted publisher, which
   promotion needs.
4. Close the obsolete automatic `changeset-release/main` PR if one remains.
5. After the cutover lands, prepare a **fresh candidate**, run its full CI, review,
   and merge. Do not force-merge an old trial candidate.

No branch-protection/environment changes, workflow dispatches, signing, or registry
writes are performed merely by editing this repository. Validate those external
settings during rollout.

## Scope and other workflows

This flow covers Changesets-managed public npm packages, generated native CLI npm
packages/binary assets, and the versioned Python runtime/workers packages. The
independently versioned Rust crate remains on `release-crates.yml`; it is outside
Changesets and is not an alternate publisher for a version-candidate release.
The older metadata-only `release-dry-run.yml` is a nonpublishing diagnostic, not a
release entry point or an additional approval gate.

## Checks and recovery

After a release, inspect its Actions summary and:

```sh
npm view vercel version
npm dist-tag ls vercel
```

Acceptance failures do not undo a publication that already reached npm. Retry
transient test/notes failures against the saved release. Fix code defects forward.
An authorized npm maintainer can move `latest` manually when necessary:

```sh
npm dist-tag add vercel@<known-good-version> latest
```

This does not replace package bytes or change already-installed versions.
