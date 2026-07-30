#!/usr/bin/env node
// Determine whether the current push to `main` will actually publish, and
// therefore whether the native binaries must be built and published first.
//
// Why this exists:
//   `changesets/action` picks between two mutually exclusive outcomes:
//     1. Pending changesets exist  -> it only creates/updates the
//        "Version Packages" PR. Nothing is published.
//     2. No pending changesets     -> it runs the publish script, which is the
//        only moment `vercel` can reach npm.
//   Checking "is packages/cli's version already on npm?" alone is not enough:
//   that check is false for reasons unrelated to whether this run publishes
//   (e.g. any feature push while the release PR is open reports the committed
//   version as unpublished), so it would build and publish natives for a
//   version that is not being released. The changeset state is the primary
//   signal; the npm check only answers "does this publish include `vercel`?".
//
// Outputs (appended to $GITHUB_OUTPUT when present):
//   will-publish          - 'true' when changesets/action will run `ci:publish`
//   should-release-binary - 'true' when that publish includes `vercel`, which
//                           requires the @vercel/vc-native-* packages on npm
//                           first (see utils/inject-native-optional-deps.mjs)

import { execFile } from 'node:child_process';
import { appendFile, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Read pending changesets using the same `@changesets/read` that
 * `changesets/action` uses, so parsing cannot drift from the action's behavior.
 * It is a dependency of `@changesets/cli` (our direct devDep) rather than of the
 * workspace root, so resolve it from the CLI package.
 *
 * Note: changesets/action also filters out changesets a pre-mode release
 * already shipped. This repo has never used pre mode (`.changeset/pre.json` has
 * never existed in git history) and `assertNotPreMode` below hard-fails if that
 * ever changes, so that filtering is deliberately not reimplemented here.
 */
function loadReadChangesets() {
  const require = createRequire(import.meta.url);
  const changesetsRequire = createRequire(
    require.resolve('@changesets/cli/package.json')
  );
  return changesetsRequire('@changesets/read').default;
}

/**
 * Fail loudly rather than silently miscounting if someone runs
 * `changeset pre enter`, since pre mode changes which changesets are pending.
 *
 * @param {string} cwd
 */
async function assertNotPreMode(cwd) {
  try {
    await readFile(join(cwd, '.changeset', 'pre.json'), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      return;
    }
    throw err;
  }

  throw new Error(
    '.changeset/pre.json exists, so this repo is using changesets pre mode. ' +
      'Release detection does not account for pre mode; teach ' +
      'utils/determine-release.mjs to filter pre-released changesets ' +
      '(see readChangesetState in changesets/action) before releasing.'
  );
}

/**
 * @param {string} cwd
 */
export async function readChangesetState(cwd = repoRoot, readChangesets) {
  await assertNotPreMode(cwd);
  const changesets = await (readChangesets ?? loadReadChangesets())(cwd);
  return { changesets };
}

/**
 * @param {object} [options]
 * @param {string} [options.cwd]
 * @param {(spec: string) => Promise<boolean>} [options.isPublished]
 */
export async function determineRelease({
  cwd = repoRoot,
  isPublished = isPublishedOnNpm,
  readChangesets,
} = {}) {
  const { changesets } = await readChangesetState(cwd, readChangesets);

  // changesets/action runs the publish script only when no pending changesets
  // remain, which is what a "Version Packages" merge looks like.
  const willPublish = changesets.length === 0;

  const cliVersion = JSON.parse(
    await readFile(join(cwd, 'packages', 'cli', 'package.json'), 'utf8')
  ).version;

  let cliPublished = null;
  let shouldReleaseBinary = false;
  let reason;

  if (!willPublish) {
    const nonEmpty = changesets.filter(
      changeset => changeset.releases.length > 0
    ).length;
    reason =
      nonEmpty > 0
        ? `${changesets.length} pending changeset(s) (${nonEmpty} non-empty); changesets/action will open/update the Version Packages PR instead of publishing.`
        : `${changesets.length} pending changeset(s), all with empty frontmatter; changesets/action will not publish.`;
  } else {
    cliPublished = await isPublished(`vercel@${cliVersion}`);
    shouldReleaseBinary = !cliPublished;
    reason = cliPublished
      ? `No pending changesets, but vercel@${cliVersion} is already on npm; this publish does not include vercel.`
      : `No pending changesets and vercel@${cliVersion} is not on npm; this run publishes vercel and needs its native packages on npm first.`;
  }

  return {
    willPublish,
    shouldReleaseBinary,
    cliVersion,
    cliPublished,
    pendingChangesets: changesets.map(changeset => changeset.id),
    reason,
  };
}

/**
 * Resolve whether `spec` exists on npm.
 *
 * A missing version is a clean E404. Any other failure (network blip, registry
 * outage, auth misconfiguration) is ambiguous, so retry before falling back to
 * "not published" - that fallback errs toward building the natives, which only
 * costs CI time, whereas a wrong "published" would let `vercel` publish without
 * its natives.
 */
async function isPublishedOnNpm(spec, { attempts = 3, delayMs = 3000 } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await execFileAsync('npm', ['view', spec, 'version']);
      return true;
    } catch (err) {
      const output = `${err.stdout ?? ''}${err.stderr ?? ''}`;
      if (/E404|404 Not Found/.test(output)) {
        return false;
      }
      lastError = output.trim() || err.message;
      if (attempt < attempts) {
        console.log(
          `npm view ${spec} failed (attempt ${attempt}/${attempts}), retrying...`
        );
        await new Promise(done => setTimeout(done, delayMs));
      }
    }
  }

  console.log(
    `::warning::Could not determine whether ${spec} is on npm; assuming it is not.\n${lastError}`
  );
  return false;
}

async function main() {
  const result = await determineRelease();

  console.log(result.reason);
  if (result.pendingChangesets.length > 0) {
    console.log(`pending changesets: ${result.pendingChangesets.join(', ')}`);
  }
  console.log(`will-publish=${result.willPublish}`);
  console.log(`should-release-binary=${result.shouldReleaseBinary}`);

  if (process.env.GITHUB_OUTPUT) {
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `will-publish=${result.willPublish}\n` +
        `should-release-binary=${result.shouldReleaseBinary}\n`
    );
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      '### Release detection\n\n' +
        `- ${result.reason}\n` +
        `- \`will-publish\`: \`${result.willPublish}\`\n` +
        `- \`should-release-binary\`: \`${result.shouldReleaseBinary}\`\n`
    );
  }
}

// Only run when executed directly, so the helpers stay unit testable.
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch(err => {
    console.error(`::error::Failed to determine release state: ${err.message}`);
    process.exit(1);
  });
}
