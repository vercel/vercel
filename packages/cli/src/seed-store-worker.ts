/**
 * Background worker that seeds the managed CLI store with the running
 * package's own published version. Spawned detached from the main CLI
 * process (see index.ts) so it never delays a user's command.
 *
 * Usage: node seed-store-worker.js <version>
 *
 * The version is installed from the npm registry with full integrity
 * verification — never copied from the local install, whose files may be
 * incomplete under isolated layouts (e.g. pnpm's store-linked packages).
 * A dev build whose version is not published simply fails the registry
 * lookup and exits; the attempt marker prevents retry storms.
 */
import { installVersionToStore } from './util/cli-store';
import { packageName } from './util/pkg-name';

const version = process.argv[2];

if (!version) {
  process.exit(1);
}

installVersionToStore(packageName, version)
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
