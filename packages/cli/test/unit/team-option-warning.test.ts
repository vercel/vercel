import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execCli } from '../helpers/exec';
import { getCliPath } from '../helpers/get-cli-path';

const binaryPath = getCliPath();

// `--team` is the old name of the global `--scope`. The warning comes from
// the entry point, before the command runs, so this runs the built CLI with
// the network turned off.
describe('global --team', () => {
  let directory: string;
  let preloadPath: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'vc-team-option-'));
    preloadPath = join(directory, 'no-network.cjs');
    await writeFile(
      join(directory, 'config.json'),
      JSON.stringify({ telemetry: { enabled: false } })
    );
    await writeFile(
      preloadPath,
      `const rejectNetwork = () => {
  throw new Error('Network is off in this test');
};
globalThis.fetch = rejectNetwork;
for (const protocol of ['node:http', 'node:https']) {
  const transport = require(protocol);
  transport.request = rejectNetwork;
  transport.get = rejectNetwork;
}
`
    );
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  function run(args: string[]) {
    return execCli(
      binaryPath,
      ['-Q', directory, '--cwd', directory, '--non-interactive=false', ...args],
      {
        cwd: directory,
        token: 'dummy_token',
        scope: false,
        timeout: 30_000,
        env: {
          CI: '1',
          FORCE_TTY: '0',
          VERCEL_TOKEN: '',
          VERCEL_SCOPE: '',
          VERCEL_TEAM_ID: '',
          VERCEL_ORG_ID: '',
          VERCEL_PROJECT_ID: '',
          VERCEL_TELEMETRY_DISABLED: '1',
          NODE_OPTIONS: `--require ${JSON.stringify(preloadPath)}`,
        },
      }
    );
  }

  it.each([
    [['--team', 'acme']],
    [['--team=acme']],
    [['-T', 'acme']],
  ])('warns once that %j is deprecated, naming --scope', async team => {
    const result = await run(['whoami', ...team]);

    expect(result.stderr.match(/deprecated/g)).toHaveLength(1);
    expect(result.stderr).toContain('! --team is deprecated. Use --scope.\n');
    expect(result.stderr).not.toContain('WARNING!');
  });

  it('prints no warning with --json', async () => {
    const result = await run(['whoami', '--team', 'acme', '--json']);

    expect(result.stderr).not.toContain('deprecated');
  });

  it('prints no warning for --scope', async () => {
    const result = await run(['whoami', '--scope', 'acme']);

    expect(result.stderr).not.toContain('deprecated');
  });
});
