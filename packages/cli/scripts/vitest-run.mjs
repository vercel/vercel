// Wrapper around vitest that accepts test file paths via VITEST_TEST_FILES env var
// instead of CLI arguments. This bypasses the Windows cmd.exe ~8191 char arg limit
// that turbo hits when passing many test paths through package.json scripts.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const vitestBin = fileURLToPath(
  new URL('../../../node_modules/.bin/vitest', import.meta.url)
);

// Paths come from VITEST_TEST_FILES (CI, space-separated) or direct CLI args (local dev)
const envFiles = (process.env.VITEST_TEST_FILES ?? '')
  .split(' ')
  .filter(Boolean);
const files = envFiles.length > 0 ? envFiles : process.argv.slice(2);

const result = spawnSync(
  process.execPath,
  [vitestBin, '--config', './vitest.config.mts', ...files],
  { stdio: 'inherit', shell: false }
);

process.exit(result.status ?? 1);
