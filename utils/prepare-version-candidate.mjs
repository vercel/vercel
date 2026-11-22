/**
 * Preparation only. Notes come from ci:version's generated CHANGELOG entries,
 * never raw changeset summaries. The committed receipt cannot contain its own H.
 * Only the main-run artifact receipt, written AFTER PR creation, registers H.
 */
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TITLE = 'Version Packages';
const VERSION_HEADING =
  /^## (\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)[ \t]*$/;

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function sha(value) {
  check(
    typeof value === 'string' &&
      value.length === 40 &&
      /^[a-f0-9]{40}$/.test(value),
    'Expected a full lowercase commit SHA'
  );
  return value;
}

function positiveInteger(value) {
  check(
    (typeof value === 'number' ||
      (typeof value === 'string' && String(Number(value)) === value)) &&
      Number.isSafeInteger(Number(value)) &&
      Number(value) > 0,
    'Expected a positive safe integer'
  );
  return Number(value);
}

export function candidateReceipt({ sourceSha, runId, runAttempt }) {
  return {
    schemaVersion: 1,
    sourceSha: sha(sourceSha),
    preparationRunId: positiveInteger(runId),
    preparationRunAttempt: positiveInteger(runAttempt),
  };
}

export function preparationReceipt(context) {
  const candidate = candidateReceipt(context);
  check(
    context.candidateSha !== context.sourceSha,
    'Candidate must differ from source'
  );
  return {
    schemaVersion: 1,
    candidateSha: sha(context.candidateSha),
    sourceSha: candidate.sourceSha,
    prNumber: positiveInteger(context.prNumber),
    runId: candidate.preparationRunId,
    runAttempt: candidate.preparationRunAttempt,
  };
}

// Only unfenced version headings delimit releases. Ordinary note headings and
// fenced examples containing apparent version headings must remain intact.
export function extractChangelogEntry(text, version) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let start = -1;
  let fence;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (
        marker &&
        marker[1][0] === fence[0] &&
        marker[1].length >= fence.length &&
        !marker[2].trim()
      ) {
        fence = undefined;
      }
      continue;
    }
    if (marker) {
      fence = marker[1];
      continue;
    }
    const heading = line.match(VERSION_HEADING);
    if (!heading) continue;
    if (start !== -1) return lines.slice(start, i).join('\n').trim();
    if (heading[1] === version) start = i;
  }
  check(start !== -1, `Missing generated CHANGELOG entry for ${version}`);
  check(!fence, 'Unclosed fence in generated CHANGELOG entry');
  return lines.slice(start).join('\n').trim();
}

function changedChangelogs(root, sourceSha) {
  const git = args =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' })
      .split('\0')
      .filter(Boolean);
  return [
    ...new Set([
      ...git(['diff', '--name-only', '-z', sourceSha, '--', '**/CHANGELOG.md']),
      ...git([
        'ls-files',
        '--others',
        '--exclude-standard',
        '-z',
        '--',
        '**/CHANGELOG.md',
      ]),
    ]),
  ];
}

export async function writeCandidatePreparation({
  root = process.cwd(),
  planPath,
  bodyPath,
  sourceSha,
  runId,
  runAttempt,
  changelogPaths,
}) {
  const receipt = candidateReceipt({ sourceSha, runId, runAttempt });
  const plan = JSON.parse(await readFile(planPath, 'utf8'));
  check(Array.isArray(plan.releases), 'Expected Changesets releases array');
  const releases = plan.releases.filter(release => release.type !== 'none');
  check(releases.length > 0, 'No package releases pending');
  const entries = new Map();
  for (const path of changelogPaths ?? changedChangelogs(root, sourceSha)) {
    const file = resolve(root, path);
    const pkg = JSON.parse(
      await readFile(join(dirname(file), 'package.json'), 'utf8')
    );
    entries.set(pkg.name, {
      version: pkg.version,
      text: await readFile(file, 'utf8'),
    });
  }
  const sections = releases
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(release => {
      const entry = entries.get(release.name);
      check(
        entry && entry.version === release.newVersion,
        `Missing generated CHANGELOG or version mismatch for ${release.name}`
      );
      return `## \`${release.name}\`\n\n${extractChangelogEntry(entry.text, release.newVersion)}\n`;
    });
  const body = [
    `# ${TITLE}\n`,
    'Keep this PR in draft until its frozen candidate has passed CI and is ready for review.\n',
    'This managed branch stays frozen unless a maintainer explicitly reruns **Manual Version Packages** on main to prepare a replacement from that dispatch’s main SHA. Preparation does not build or publish packages. Do not push, merge main, or rebase this branch.\n',
    'CI does not start automatically for this `GITHUB_TOKEN`-created PR. **Close and reopen this draft** to run Tests and Frozen version candidate on its exact head; approve the CI run if GitHub requests approval. After any explicit preparation refresh, repeat this step and obtain fresh review approval.\n',
    `Source at dispatch: \`${sourceSha}\`\n`,
    `Preparation run: \`${receipt.preparationRunId}\`, attempt \`${receipt.preparationRunAttempt}\`. The authenticated main-run artifact \`version-candidate-<head SHA>\` contains \`receipt.json\`; neither this body nor the committed receipt registers a candidate.\n`,
    'The following entries were generated by `pnpm ci:version` in package CHANGELOG files (including private/internal packages; not a publication list).\n',
    ...sections,
  ].join('\n');
  await writeFile(bodyPath, body);
  // Freeze the pre-version status plan for packaging, not raw changeset notes.
  // Keep all status entries (including `none`) and only the agreed fields.
  await writeFile(
    join(root, '.release-plan.json'),
    `${JSON.stringify(
      {
        releases: plan.releases.map(
          ({ name, oldVersion, newVersion, type }) => ({
            name,
            oldVersion,
            newVersion,
            type,
          })
        ),
      },
      null,
      2
    )}\n`
  );
  await writeFile(
    join(root, '.release-candidate.json'),
    `${JSON.stringify(receipt, null, 2)}\n`
  );
  return receipt;
}

export async function writePreparationReceipt(outputDir, context) {
  const receipt = preparationReceipt(context);
  await mkdir(outputDir, { recursive: true });
  const path = join(outputDir, 'receipt.json');
  await writeFile(path, `${JSON.stringify(receipt, null, 2)}\n`, {
    flag: 'wx',
  });
  return {
    receipt,
    path,
    artifactName: `version-candidate-${receipt.candidateSha}`,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    check(
      process.argv.length === 2,
      'Use environment variables; no CLI arguments'
    );
    await writeCandidatePreparation({
      planPath: process.env.PLAN_PATH,
      bodyPath: process.env.BODY_PATH,
      sourceSha: process.env.GITHUB_SHA,
      runId: process.env.GITHUB_RUN_ID,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT,
    });
  } catch (error) {
    console.error(
      `prepare-version-candidate: ${JSON.stringify(error.message)}`
    );
    process.exitCode = 1;
  }
}
