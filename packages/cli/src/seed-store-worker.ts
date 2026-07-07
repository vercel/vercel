// Detached worker: seeds the store with the running version, installed
// from the registry (local files may be incomplete under pnpm layouts).
// Usage: node seed-store-worker.js <version>
import { installVersionToStore } from './util/cli-store';
import { packageName } from './util/pkg-name';

const version = process.argv[2];

if (!version) {
  process.exit(1);
}

installVersionToStore(packageName, version)
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
