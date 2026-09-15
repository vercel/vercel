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

async function main() {
  const databaseUrl = process.env.CLI_RELEASE_NOTES_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('CLI_RELEASE_NOTES_DATABASE_URL is required');
  }

  const packageName = 'vercel';
  const packageJsonPath = join(repoRoot, 'packages/cli/package.json');
  const changelogPath = join(repoRoot, 'packages/cli/CHANGELOG.md');
  const [packageJson, changelog, integrity] = await Promise.all([
    readFile(packageJsonPath, 'utf8').then(JSON.parse),
    readFile(changelogPath, 'utf8'),
    readPublishIntegrity(),
  ]);
  const version = packageJson.version;
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
    `Published CLI release notes for ${packageName}@${version} (${integrity})`
  );
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
