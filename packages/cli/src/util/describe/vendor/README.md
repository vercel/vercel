# Vendored Build Container helpers

This directory contains code vendored from `vercel/api`.
Keep its structure and behavior close to upstream so changes can
be compared and synchronized. Unused branches, options, metadata, and caches
may serve other upstream callers; do not remove them just because `describe`
does not use them.

## Provenance

The source baseline is
[`vercel/api@67ff995e6636dc8958b56937c924f264068e81f8`](https://github.com/vercel/api/tree/67ff995e6636dc8958b56937c924f264068e81f8).
The original 13 vendored TypeScript files were compared against this revision on
2026-10-05; differences are limited to the local adaptations below. Establishing
this baseline changed only provenance documentation and comments.

### Service-discovery and native-output extraction (partial sync)

The following four files are pinned to
[`vercel/api@bf1cecbbf99366803bcf904814460a27896bd3fc`](https://github.com/vercel/api/tree/bf1cecbbf99366803bcf904814460a27896bd3fc),
not the older baseline above. Their only local differences are the provenance
header and formatting:

- `build-container/container/src/utils/build-output-api/get-service-output-entries.ts`
- `build-container/container/src/utils/build-output-api/read-service-output-config.ts`
- `build-container/container/src/utils/build-output-api/get-function-source-path.ts`
- `build-container/container/src/utils/build-output-api/iterate-native-function-outputs.ts`

Paths below this directory mirror the corresponding paths in `vercel/api`:

- `build-container/container/src/utils/build-output-api/`: build-output
  configuration and validation, file walking, function reading, hydration,
  middleware routing, grouping orchestration, service-output discovery and loading,
  canonical function source paths, and native-output iteration.
- `build-container/container/src/utils/maybe-read-json.ts`: JSON loading.
- `packages/group-lambdas/src/`: bundling and uncompressed-size accounting.

## Ownership boundary

The parent `describe/` directory owns the CLI workflow: authenticated API calls,
supported-output policy, ZIP and descriptor generation, retries, filesystem
replacement, and continuation generation. Build-output configuration is loaded
and validated by the vendored helper, which reads it on every invocation. Service
output discovery, missing-output rules, and function source-path construction
also use upstream helpers. Native-output iteration preserves the original paths,
Lambda identities, and prerender objects; middleware lookup remains with each
caller to preserve its validation order. The CLI retains its service-inventory
admission guard and translates missing-service-output errors into command-facing
guidance.

Code here owns the upstream algorithms. Preserve upstream filenames, exported
interfaces, and control flow. Do not add command flags, authentication, HTTP
requests, or artifact-lifecycle policy here. Prefer implementing CLI behavior in
the parent directory. Behavioral fixes to these helpers should be made upstream
and ported here; when a local fix must land first, record the divergence below
and carry it through subsequent syncs.

## Existing local adaptations

These adaptations must be reviewed when syncing:

- Imports point to this tree or installed workspace packages. In particular,
  `hydrate-lambda-files.ts` imports the public `@vercel/build-utils` entry point.
- `read-functions.ts` attaches a rejection handler directly to the pending
  prerender-config read instead of using upstream's `background()` helper. The
  original promise is still awaited and its failure still propagates.
- `packages/group-lambdas/src/group-lambdas.ts` sends warnings and debug output
  through the CLI output manager instead of `console`. This is the existing
  host integration in the vendored code.
- Repository formatting, provenance comments, and removal of inapplicable
  TypeScript/lint suppression comments differ from the snapshot.

## Sync and review

1. Compare the relevant file and its dependencies against its pinned API revision
   (or the corresponding partial-sync source above).
   For a file at `vendor/<path>` here, the baseline is available with
   `git -C ../api show 67ff995e6636dc8958b56937c924f264068e81f8:<path>`.
2. Review upstream changes with
   `git -C ../api diff 67ff995e6636dc8958b56937c924f264068e81f8 <TARGET_COMMIT> -- <path>`
   and the corresponding upstream tests. Port
   related files together, preserving the adaptations above. Do not blindly
   overwrite the directory or simplify upstream algorithms during the sync.
3. Record the source commit, files updated, and any added or removed adaptations
   in this document. For a partial sync, record a per-file revision instead of
   advancing the baseline for untouched files.
4. Run the focused describe tests and lint/format checks. Port relevant upstream
   regression tests when behavior changes.

For this command's initial review, review the parent workflow and the adaptations
above first, then compare the vendored files to the pinned source. Vendoring does
not exempt the code from correctness or security review.
