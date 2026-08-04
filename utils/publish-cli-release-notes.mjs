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

async function main() {
  const databaseUrl = process.env.CLI_RELEASE_NOTES_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('CLI_RELEASE_NOTES_DATABASE_URL is required');
  }

  const packageJsonPath = join(repoRoot, 'packages/cli/package.json');
  const changelogPath = join(repoRoot, 'packages/cli/CHANGELOG.md');
  const [packageJson, changelog] = await Promise.all([
    readFile(packageJsonPath, 'utf8').then(JSON.parse),
    readFile(changelogPath, 'utf8'),
  ]);
  const version = packageJson.version;
  const changes = parseReleaseNotes(changelog, version);

  if (Object.keys(changes).length === 0) {
    throw new Error(`No direct changes found for vercel@${version}`);
  }

  const sql = neon(databaseUrl);
  await sql`
    INSERT INTO cli_release_notes (
      package_name,
      version,
      published_at,
      changes
    )
    VALUES (
      ${'vercel'},
      ${version},
      NOW(),
      ${JSON.stringify(changes)}::jsonb
    )
    ON CONFLICT (package_name, version)
    DO UPDATE SET changes = EXCLUDED.changes
  `;

  console.log(`Published CLI release notes for vercel@${version}`);
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
