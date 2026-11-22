import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const CHANGE_TYPE_BY_HEADING = {
  'Major Changes': 'major',
  'Minor Changes': 'minor',
  'Patch Changes': 'patch',
};

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), '..');

/** Written by utils/npm-publish.sh after a successful `vercel` tarball publish. */
export const PUBLISH_INTEGRITY_ENV = 'VERCEL_CLI_PUBLISH_INTEGRITY';
export const PUBLISH_INTEGRITY_FILE = join(
  repoRoot,
  '.vercel-cli-publish-integrity'
);

function parseChangeEntry(lines) {
  const entry = lines
    .map(line => line.trim())
    .filter(Boolean)
    .join(' ');
  const match = entry.match(/^([a-f0-9]{7,40}):\s+(.+)$/i);

  if (!match) return undefined;

  return {
    commit: match[1],
    description: match[2],
  };
}

export function parseReleaseNotes(changelog, version) {
  const lines = changelog.split(/\r?\n/);
  const releaseStart = lines.indexOf(`## ${version}`);

  if (releaseStart === -1) {
    throw new Error(`Could not find vercel@${version} in the CLI changelog`);
  }

  const nextReleaseOffset = lines
    .slice(releaseStart + 1)
    .findIndex(line => line.startsWith('## '));
  const releaseEnd =
    nextReleaseOffset === -1
      ? lines.length
      : releaseStart + nextReleaseOffset + 1;
  const releaseLines = lines.slice(releaseStart + 1, releaseEnd);
  const changes = {};
  let changeType;
  let entryLines = [];

  const flushEntry = () => {
    if (!changeType || entryLines.length === 0) {
      entryLines = [];
      return;
    }

    const entry = parseChangeEntry(entryLines);
    if (entry) {
      changes[changeType] ??= [];
      changes[changeType].push(entry);
    }

    entryLines = [];
  };

  for (const line of releaseLines) {
    const heading = line.match(/^### (.+)$/);
    if (heading) {
      flushEntry();
      changeType = CHANGE_TYPE_BY_HEADING[heading[1]];
      continue;
    }

    const bullet = line.match(/^- (.+)$/);
    if (bullet) {
      flushEntry();
      entryLines = [bullet[1]];
      continue;
    }

    if (entryLines.length > 0) {
      entryLines.push(line);
    }
  }

  flushEntry();

  return changes;
}

function assertSha512Integrity(value, source) {
  const integrity = typeof value === 'string' ? value.trim() : '';
  if (!integrity.startsWith('sha512-')) {
    throw new Error(
      `Missing vercel publish integrity from ${source} (expected sha512-… from npm-publish.sh)`
    );
  }
  return integrity;
}

export const PACKAGE_NAME = 'vercel';
const NPM_REGISTRY_URL = 'https://registry.npmjs.org';

export function isSha512Integrity(value) {
  return typeof value === 'string' && value.trim().startsWith('sha512-');
}

function hasReleaseChanges(changes) {
  if (!changes || typeof changes !== 'object') return false;
  return Object.values(changes).some(
    entries => Array.isArray(entries) && entries.length > 0
  );
}

function isPrereleaseVersion(version) {
  return String(version).includes('-');
}

export function tryParseReleaseNotes(changelog, version) {
  try {
    return parseReleaseNotes(changelog, version);
  } catch {
    return {};
  }
}

/**
 * Full npm packument for a package (all versions, dist.integrity, time).
 */
export async function fetchNpmPackument(
  packageName,
  { fetchImpl = fetch } = {}
) {
  const encodedName = packageName.split('/').map(encodeURIComponent).join('/');
  const response = await fetchImpl(`${NPM_REGISTRY_URL}/${encodedName}`);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${packageName} packument from npm (${response.status})`
    );
  }
  return response.json();
}

/**
 * @returns {{ version: string, integrity: string, publishedAt: string | null }[]}
 */
export function npmIntegrityEntries(packument) {
  const versions = packument?.versions ?? {};
  const times = packument?.time ?? {};
  const entries = [];

  for (const [version, manifest] of Object.entries(versions)) {
    const integrity =
      typeof manifest?.dist?.integrity === 'string'
        ? manifest.dist.integrity.trim()
        : '';
    if (!integrity.startsWith('sha512-')) continue;
    const publishedAt =
      typeof times[version] === 'string' ? times[version] : null;
    entries.push({ version, integrity, publishedAt });
  }

  return entries;
}

/**
 * Plan a one-shot historical backfill from npm packument data.
 *
 * Existing first-party sha512 values (recorded at publish time) are never
 * overwritten. Missing integrity is filled from npm; versions that are not
 * in the table yet are inserted so the hosted integrity endpoint can serve
 * them. Changelog notes are attached on insert when they parse.
 */
export function planIntegrityBackfill({
  npmEntries,
  existingRows,
  changelog = '',
} = {}) {
  const existingByVersion = new Map(
    (existingRows ?? []).map(row => [row.version, row])
  );
  const updates = [];
  const inserts = [];
  const skipped = [];

  for (const entry of npmEntries ?? []) {
    const existing = existingByVersion.get(entry.version);
    if (existing) {
      if (isSha512Integrity(existing.integrity)) {
        skipped.push({ version: entry.version, reason: 'already-set' });
        continue;
      }
      updates.push({
        version: entry.version,
        integrity: entry.integrity,
      });
      continue;
    }

    const changes = changelog
      ? tryParseReleaseNotes(changelog, entry.version)
      : {};
    if (isPrereleaseVersion(entry.version) && !hasReleaseChanges(changes)) {
      skipped.push({ version: entry.version, reason: 'prerelease' });
      continue;
    }

    inserts.push({
      version: entry.version,
      integrity: entry.integrity,
      publishedAt: entry.publishedAt,
      changes,
    });
  }

  return { updates, inserts, skipped };
}

export async function applyIntegrityBackfill(
  sql,
  { updates, inserts, packageName = PACKAGE_NAME } = {}
) {
  for (const row of updates ?? []) {
    await sql`
      UPDATE cli_release_notes
      SET integrity = ${row.integrity}
      WHERE package_name = ${packageName}
        AND version = ${row.version}
        AND (integrity IS NULL OR integrity NOT LIKE 'sha512-%')
    `;
  }

  for (const row of inserts ?? []) {
    const publishedAt = row.publishedAt ?? new Date().toISOString();
    await sql`
      INSERT INTO cli_release_notes (
        package_name,
        version,
        published_at,
        changes,
        integrity
      )
      VALUES (
        ${packageName},
        ${row.version},
        ${publishedAt}::timestamptz,
        ${JSON.stringify(row.changes ?? {})}::jsonb,
        ${row.integrity}
      )
      ON CONFLICT (package_name, version)
      DO UPDATE SET
        integrity = CASE
          WHEN cli_release_notes.integrity IS NULL
            OR cli_release_notes.integrity NOT LIKE 'sha512-%'
          THEN EXCLUDED.integrity
          ELSE cli_release_notes.integrity
        END
    `;
  }
}

/**
 * Reads the tarball integrity recorded by utils/npm-publish.sh for the
 * `vercel` package that was just published in this job.
 *
 * Prefers VERCEL_CLI_PUBLISH_INTEGRITY (set via GITHUB_ENV), then the
 * workspace file written next to the pack/publish step.
 */
export async function readPublishIntegrity({
  env = process.env,
  filePath = PUBLISH_INTEGRITY_FILE,
} = {}) {
  const fromEnv = env[PUBLISH_INTEGRITY_ENV];
  if (typeof fromEnv === 'string' && fromEnv.trim()) {
    return assertSha512Integrity(fromEnv, PUBLISH_INTEGRITY_ENV);
  }

  try {
    const fromFile = await readFile(filePath, 'utf8');
    return assertSha512Integrity(fromFile, filePath);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw new Error(
        `Missing vercel publish integrity (set ${PUBLISH_INTEGRITY_ENV} or write ${filePath} from npm-publish.sh)`
      );
    }
    throw error;
  }
}

export async function main({ env = process.env } = {}) {
  const databaseUrl = env.CLI_RELEASE_NOTES_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('CLI_RELEASE_NOTES_DATABASE_URL is required');
  }

  const packageName = PACKAGE_NAME;
  const packageJsonPath = join(repoRoot, 'packages/cli/package.json');
  // Saved candidate inputs are data only; the helper runs from trusted main.
  // Keep checkout defaults for callers that publish directly from the release.
  const changelogPath =
    env.VERCEL_CLI_RELEASE_CHANGELOG ||
    join(repoRoot, 'packages/cli/CHANGELOG.md');
  // No Git/GitHub queries are needed: H is provenance for the publication log,
  // not the current checkout SHA or a ref from which to load executable code.
  const releaseSha = env.VERCEL_CLI_RELEASE_SHA;
  const [version, changelog, integrity] = await Promise.all([
    env.VERCEL_CLI_RELEASE_VERSION ||
      readFile(packageJsonPath, 'utf8').then(text => JSON.parse(text).version),
    readFile(changelogPath, 'utf8'),
    readPublishIntegrity({ env }),
  ]);
  const changes = parseReleaseNotes(changelog, version);

  if (Object.keys(changes).length === 0) {
    throw new Error(`No direct changes found for ${packageName}@${version}`);
  }

  const sql = neon(databaseUrl);
  await sql`
    INSERT INTO cli_release_notes (
      package_name,
      version,
      published_at,
      changes,
      integrity
    )
    VALUES (
      ${packageName},
      ${version},
      NOW(),
      ${JSON.stringify(changes)}::jsonb,
      ${integrity}
    )
    ON CONFLICT (package_name, version)
    DO UPDATE SET
      changes = EXCLUDED.changes,
      integrity = EXCLUDED.integrity
  `;

  console.log(
    `Published CLI release notes for ${packageName}@${version} (${integrity})${releaseSha ? ` at ${releaseSha}` : ''}`
  );
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
