/**
 * Format @changesets/cli@2.27.8 `changeset status --output <relative path>`.
 * The caller must generate the plan at SOURCE_SHA in a disposable worktree,
 * AFTER expand-internal-changesets.mjs, and upload OUTPUT_DIR/release-preview.md.
 * This formatter never runs Changesets, git, package scripts, or network calls.
 * Status does not normally report visibility: retain all planned packages,
 * including versioned private internals, rather than infer a publication list.
 *
 * CLI (all five environment variables are required):
 * PLAN_PATH=... SOURCE_SHA=... GITHUB_REPOSITORY=owner/repo \
 * GITHUB_STEP_SUMMARY=... OUTPUT_DIR=... node utils/release-rehearsal-summary.mjs
 */
import { constants } from 'node:fs';
import { lstat, mkdir, open, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SUMMARY_LIMIT = 1024 * 1024;
const WARNING =
  'Proposed versions only. This preview does not change source versions or publish packages.';
const TRUNCATION =
  '\n**Preview truncated to fit GitHub’s 1 MiB step-summary limit.** Download the complete `release-preview.md` artifact for all packages and notes.\n';
const TYPES = new Set(['none', 'patch', 'minor', 'major']);
const NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const NUMBER = '(?:0|[1-9][0-9]*)';
const PRE = '(?:0|[1-9][0-9]*|[0-9]*[a-zA-Z-][0-9a-zA-Z-]*)';
const VERSION = new RegExp(
  `^${NUMBER}\\.${NUMBER}\\.${NUMBER}(?:-${PRE}(?:\\.${PRE})*)?(?:\\+[0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*)?$`
);
const CONTROL = /[\x00-\x1f\x7f-\x9f\u2028\u2029]/;

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function matches(value, pattern) {
  return (
    typeof value === 'string' && !CONTROL.test(value) && pattern.test(value)
  );
}

function packageRelease(release) {
  check(
    record(release) &&
      matches(release.name, NAME) &&
      release.name.length <= 214 &&
      TYPES.has(release.type),
    'Invalid package name or bump type in Changesets plan'
  );
}

function validate(plan, { sourceSha, repository }) {
  check(
    matches(sourceSha, /^[a-f0-9]{40}$/),
    'Invalid SOURCE_SHA: expected full lowercase commit SHA'
  );
  check(
    matches(
      repository,
      /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/
    ),
    'Invalid GITHUB_REPOSITORY: expected owner/repository'
  );
  check(
    record(plan) &&
      Array.isArray(plan.releases) &&
      Array.isArray(plan.changesets),
    'Invalid Changesets plan: releases and changesets arrays are required'
  );
  const changesets = new Map();
  for (const changeset of plan.changesets) {
    check(
      record(changeset) &&
        matches(changeset.id, ID) &&
        typeof changeset.summary === 'string' &&
        Array.isArray(changeset.releases),
      'Invalid changeset schema'
    );
    check(!changesets.has(changeset.id), 'Duplicate changeset ID');
    const names = new Set();
    for (const release of changeset.releases) {
      packageRelease(release);
      check(!names.has(release.name), 'Duplicate package in changeset');
      names.add(release.name);
    }
    changesets.set(changeset.id, changeset);
  }
  const names = new Set();
  for (const release of plan.releases) {
    packageRelease(release);
    check(!names.has(release.name), 'Duplicate planned package');
    names.add(release.name);
    check(
      matches(release.oldVersion, VERSION) &&
        matches(release.newVersion, VERSION),
      'Invalid planned package version: expected SemVer'
    );
    check(
      release.private === undefined || typeof release.private === 'boolean',
      'Invalid private package metadata'
    );
    check(
      Array.isArray(release.changesets),
      'Invalid release changesets array'
    );
    const ids = new Set();
    for (const id of release.changesets) {
      check(
        matches(id, ID) && changesets.has(id),
        'Unknown or invalid release changeset ID'
      );
      check(!ids.has(id), 'Duplicate release changeset ID');
      ids.add(id);
    }
  }
  return changesets;
}

// Defense in depth for generated headings/table cells; note bodies are trusted
// repository Markdown, not metadata, and are preserved separately as blockquotes.
function markdown(value) {
  return value
    .replace(/[\r\n\x00-\x1f\x7f-\x9f\u2028\u2029]/g, ' ')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/[\\`*_[\]|]/g, '\\$&');
}

function previewParts(plan, context) {
  const changesets = validate(plan, context);
  const base = `https://github.com/${context.repository}`;
  const header =
    '## Release preview from Changesets\n\n' +
    `${WARNING}\n\n` +
    `Source: [\`${context.sourceSha}\`](${base}/commit/${context.sourceSha})\n\n` +
    'All planned packages are shown, including private/internal packages; this is not a publication list. Visibility is “Not reported” unless supplied by the plan.\n\n' +
    'Notes are trusted repository Markdown from the pinned changesets (not a mutable PR body). Internal expansion may add packages to those changesets without changing their notes.\n\n';
  const releases = [...plan.releases].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  );
  const blocks = [];
  if (!releases.length) {
    blocks.push(
      'No package releases are planned. Empty/non-release changesets do not propose versions.\n'
    );
    return { header, blocks };
  }
  blocks.push(
    '| Package | Current version | Proposed version | Bump | Visibility |\n| --- | --- | --- | --- | --- |\n'
  );
  for (const release of releases) {
    const visibility =
      release.private === undefined
        ? 'Not reported'
        : release.private
          ? 'Private'
          : 'Public';
    blocks.push(
      `| ${markdown(release.name)} | ${release.oldVersion} | ${release.newVersion} | ${release.type} | ${visibility} |\n`
    );
  }
  blocks.push('\n### Package details\n\n');
  for (const release of releases) {
    blocks.push(
      `#### ${markdown(release.name)}\n\n${release.oldVersion} → ${release.newVersion} (${release.type})\n\n`
    );
    if (!release.changesets.length) {
      blocks.push(
        release.type === 'none'
          ? 'No version bump or direct changeset notes are attached to this entry.\n\n'
          : 'Implicit dependency-only bump: Changesets included this package without a direct changeset (for dependency propagation or release-group alignment). No package-specific note was supplied.\n\n'
      );
    }
    for (const id of [...release.changesets].sort()) {
      const note = changesets.get(id).summary;
      const body = note.trim()
        ? note
            .replace(/\r\n?/g, '\n')
            .split('\n')
            .map(line => `> ${line}`)
            .join('\n')
        : '> No changeset note was supplied.';
      blocks.push(
        `Changeset [${markdown(id)}](${base}/blob/${context.sourceSha}/.changeset/${id}.md)\n\n${body}\n\n`
      );
    }
  }
  return { header, blocks };
}

export function formatReleasePreview(plan, context) {
  const { header, blocks } = previewParts(plan, context);
  return header + blocks.join('');
}

function cappedPreview({ header, blocks }, budget) {
  const full = header + blocks.join('');
  if (Buffer.byteLength(full) <= budget) return full;
  let size = Buffer.byteLength(header + TRUNCATION);
  check(
    size <= budget,
    'GITHUB_STEP_SUMMARY has insufficient space for the preview header and truncation notice; complete preview saved to OUTPUT_DIR/release-preview.md'
  );
  const kept = [header];
  // Keep complete rows/notes, never cut UTF-8, Markdown fences, or trusted HTML.
  for (const block of blocks) {
    const bytes = Buffer.byteLength(block);
    if (size + bytes > budget) break;
    kept.push(block);
    size += bytes;
  }
  return kept.join('') + TRUNCATION;
}

function pathFrom(env, key) {
  const value = env[key];
  check(
    typeof value === 'string' &&
      value.trim() === value &&
      value.length > 0 &&
      !CONTROL.test(value) &&
      !/^[a-z][a-z0-9+.-]*:\/\//i.test(value),
    `Invalid ${key}: expected a local file path`
  );
  return resolve(value);
}

export async function writeReleasePreview(env = process.env) {
  const planPath = pathFrom(env, 'PLAN_PATH');
  const summaryPath = pathFrom(env, 'GITHUB_STEP_SUMMARY');
  const outputDir = pathFrom(env, 'OUTPUT_DIR');
  const artifactPath = join(outputDir, 'release-preview.md');
  check(
    new Set([planPath, summaryPath, artifactPath]).size === 3,
    'Plan, summary, and artifact paths must be distinct'
  );
  const planStat = await lstat(planPath);
  check(planStat.isFile(), 'PLAN_PATH must be a regular file, not a symlink');
  const plan = JSON.parse(await readFile(planPath, 'utf8'));
  const parts = previewParts(plan, {
    sourceSha: env.SOURCE_SHA,
    repository: env.GITHUB_REPOSITORY,
  });
  await mkdir(outputDir, { recursive: true });
  // Never overwrite an existing file (including a symlink or the source plan).
  await writeFile(artifactPath, parts.header + parts.blocks.join(''), {
    flag: 'wx',
  });
  const summary = await open(
    summaryPath,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_APPEND |
      constants.O_NOFOLLOW,
    0o600
  );
  try {
    const stat = await summary.stat();
    check(
      stat.isFile() &&
        stat.nlink === 1 &&
        !(stat.dev === planStat.dev && stat.ino === planStat.ino),
      'GITHUB_STEP_SUMMARY must be a separate regular file, not a linked source file'
    );
    const preview = cappedPreview(parts, SUMMARY_LIMIT - stat.size - 2);
    await summary.writeFile(`\n\n${preview}`);
  } finally {
    await summary.close();
  }
  return artifactPath;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    check(
      process.argv.length === 2,
      'Use PLAN_PATH, SOURCE_SHA, GITHUB_REPOSITORY, GITHUB_STEP_SUMMARY and OUTPUT_DIR environment variables; no CLI arguments'
    );
    await writeReleasePreview();
  } catch (error) {
    // Keep invalid metadata/paths from injecting terminal or workflow log lines.
    console.error(
      `release-rehearsal-summary: ${JSON.stringify(error.message)}`
    );
    process.exitCode = 1;
  }
}
