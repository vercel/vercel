import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const cliRoot = join(here, '..', '..', '..');
const indexPath = join(cliRoot, 'dist', 'index.js');
const { version } = JSON.parse(
  readFileSync(join(cliRoot, 'package.json'), 'utf8')
);

describe('dist/index.js', () => {
  // The build container runs `node vercel/dist/index.js build`, and
  // scripts/start.js imports it, so executing the module must run the CLI.
  it('runs the CLI when executed directly', () => {
    const result = spawnSync(process.execPath, [indexPath, '--version'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        NO_UPDATE_NOTIFIER: '1',
        VERCEL_TELEMETRY_DISABLED: '1',
      },
      timeout: 30_000,
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe(version);
  });
});
