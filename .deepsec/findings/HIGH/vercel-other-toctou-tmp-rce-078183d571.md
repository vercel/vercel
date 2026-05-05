# [HIGH] Predictable shared /tmp sidecar dir enables local TOCTOU code execution against compiled CLI binary

**File:** [`packages/cli/scripts/build-binary.mjs`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/cli/scripts/build-binary.mjs#L270-L286) (lines 270, 271, 272, 273, 274, 275, 276, 277, 278, 279, 282, 283, 284, 285, 286)
**Project:** vercel
**Severity:** HIGH  •  **Confidence:** high  •  **Slug:** `other-toctou-tmp-rce`

## Owners

**Suggested assignee:** `amokstakov@gmail.com` _(via last-committer)_

## Finding

The wrapper code generated for the standalone (bun-compiled) `vercel` binary writes JavaScript sidecars (`dev-server.mjs`, `builder-worker.cjs`, `bundling-handler.js`, `edge-handler-template.js`) into a deterministic, world-discoverable directory: `${tmpdir()}/vercel-cli-binary-${pkg.version}-${sidecarAssetsDigest}/`. The path is fixed at build time (both `pkg.version` and `sidecarAssetsDigest` are interpolated at build time) and shared across all users on the system. On Linux, `os.tmpdir()` typically resolves to `/tmp` which is shared and world-readable. The wrapper does:

  mkdirSync(sidecarDir, { recursive: true });               // no mode: 0755 by default
  for (const asset of sidecarAssets) {
    const file = join(sidecarDir, asset.filename);
    if (!existsSync(file) || readFileSync(file, 'utf8') !== asset.contents) {
      writeFileSync(file, asset.contents, 'utf8');
    }
  }

Attack scenario (local privilege escalation / cross-user RCE on shared Linux hosts — multi-tenant dev boxes, lab/uni machines, shared CI runners with a single shared `/tmp`):
  1. Attacker (local user A) creates `/tmp/vercel-cli-binary-<ver>-<digest>/` with mode 0755 and writes each sidecar file with the *legitimate* content (the version + digest are extractable from any copy of the binary).
  2. Victim (user B) later runs the `vercel` binary. mkdirSync succeeds (dir exists), `existsSync` is true, `readFileSync(file) === asset.contents` matches, so writeFileSync is *skipped*. The wrapper sets `VERCEL_CLI_BINARY_DEV_SERVER_PATH`, `VERCEL_CLI_BINARY_BUILDER_WORKER_PATH`, etc. to attacker-owned files.
  3. Attacker swaps the content of `dev-server.mjs` (or `builder-worker.cjs`) for a malicious payload — they retain ownership of the file because they created it.
  4. When victim runs `vercel dev` or any build path, the CLI calls `spawn(bun, ['--bun', devServerPath])` (packages/node/src/fork-dev-server.ts:36) or `fork(builderWorkerPath, ...)` (packages/cli/src/util/dev/builder.ts:179-191), executing the attacker-controlled JS as the victim user.

The content check at L277 is a TOCTOU window — it confirms content matched at startup, but the file is re-read from disk at fork/spawn time, and the attacker can replace it in between.

Secondary issues compounding the risk: (a) no explicit mode on `mkdirSync` (default permissive umask leaves the dir world-traversable), (b) no ownership verification of the directory before trusting its contents, (c) `recursive: true` happily reuses an attacker-owned directory rather than failing.

Note: macOS and Windows typically use per-user temp dirs (`/var/folders/<hash>/T/...`, `%TEMP%`), so this primarily affects Linux multi-user / shared-CI environments, but those are common enough that this is high-impact.

## Recommendation

Make the sidecar directory unguessable and per-user, and verify ownership before trusting cached contents. Concrete options:
  1. Include the user identity in the path: `join(tmpdir(), `vercel-cli-binary-${userInfo().uid}-${pkg.version}-${digest}`)` AND create with strict mode: `mkdirSync(sidecarDir, { recursive: true, mode: 0o700 })`.
  2. Before reusing an existing directory, `fs.statSync(sidecarDir)` and verify `stat.uid === process.getuid()` and `(stat.mode & 0o022) === 0`; if not, refuse to use it (or pick a random fresh dir).
  3. Stronger fix: use `fs.mkdtempSync(join(tmpdir(), `vercel-cli-binary-`))` to allocate a fresh random directory per CLI invocation, and write the sidecars there each time. This eliminates the predictability and the TOCTOU window entirely (at the cost of a small extra disk write each run).
  4. Always rewrite the contents (drop the content-equality skip), or open files with `O_EXCL`/`wx` flag to fail if the file already exists with unexpected ownership.

## Recent committers (`git log`)

- melkeydev <amokstakov@gmail.com> (2026-04-26)
