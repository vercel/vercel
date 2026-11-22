import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';
import {
  PACKAGE_NAME,
  applyIntegrityBackfill,
  fetchNpmPackument,
  npmIntegrityEntries,
  planIntegrityBackfill,
} from './publish-cli-release-notes.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), '..');
const changelogPath = join(repoRoot, 'packages/cli/CHANGELOG.md');

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const databaseUrl = process.env.CLI_RELEASE_NOTES_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('CLI_RELEASE_NOTES_DATABASE_URL is required');
  }

  const sql = neon(databaseUrl);
  const [packument, changelog, existingRows] = await Promise.all([
    fetchNpmPackument(PACKAGE_NAME),
    readFile(changelogPath, 'utf8'),
    sql`
      SELECT version, integrity
      FROM cli_release_notes
      WHERE package_name = ${PACKAGE_NAME}
    `,
  ]);

  const plan = planIntegrityBackfill({
    npmEntries: npmIntegrityEntries(packument),
    existingRows,
    changelog,
  });

  console.log(
    `CLI integrity backfill: ${plan.updates.length} update(s), ${plan.inserts.length} insert(s), ${plan.skipped.length} already set`
  );

  if (dryRun) {
    for (const row of plan.updates) {
      console.log(`  update ${PACKAGE_NAME}@${row.version}`);
    }
    for (const row of plan.inserts) {
      console.log(`  insert ${PACKAGE_NAME}@${row.version}`);
    }
    console.log('Dry run; no database writes.');
    return;
  }

  await applyIntegrityBackfill(sql, plan);
  console.log(
    `Backfilled npm dist.integrity for historical ${PACKAGE_NAME} releases (first-party sha512 values left in place)`
  );
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
