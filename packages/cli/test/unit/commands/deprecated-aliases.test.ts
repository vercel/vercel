import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { client } from '../../mocks/client';
import { commands } from '../../../src/commands';
import { entryPoint } from '../../helpers/command-entry-points';

// `version update` installs the latest release on an installer-managed CLI.
// Pin a package-manager install, which refuses before anything downloads.
vi.mock('../../../src/util/version-context', async importOriginal => ({
  ...(await importOriginal<
    typeof import('../../../src/util/version-context')
  >()),
  getVersionContext: async () => ({
    version: '0.0.0',
    runtime: 'node',
    manager: 'package-manager',
    canSwitchVersions: false,
    packageManager: 'npm',
    packageManagerAssumed: false,
    global: true,
    upgradeCommand: 'npm i -g vercel@latest',
  }),
}));
vi.mock('../../../src/util/installer-upgrade', async importOriginal => ({
  ...(await importOriginal<
    typeof import('../../../src/util/installer-upgrade')
  >()),
  installProductionRelease: () => {
    throw new Error('Tests must not install a CLI release');
  },
}));

// Old command names that still run and print one deprecation warning. Each
// one must otherwise behave exactly like the name it points to.
interface Row {
  /** The old spelling, after `vercel`. */
  old: string;
  /** The name the warning teaches. */
  current: string;
  /** What follows the command. A placeholder unless noted. */
  args?: string[];
}

const PLACEHOLDER = ['zz-placeholder'];

const ROWS: Row[] = [
  // `vercel dev` starts a server, so pass one argument too many.
  { old: 'develop', current: 'dev', args: ['zz-one', 'zz-two'] },
  { old: 'i', current: 'install' },
  { old: 'ln', current: 'alias' },
  { old: 'edge-config', current: 'global-config' },
  { old: 'ir', current: 'integration resource' },
  { old: 'integration-resource', current: 'integration resource' },
  { old: 'mf', current: 'microfrontends' },
  { old: 'rr', current: 'rolling-release' },
  { old: 'status-page', current: 'health' },
  { old: 'tokenpass', current: 'token-pass' },
  { old: 'log', current: 'logs' },
  { old: 'blob cp', current: 'blob copy' },
  { old: 'blob ls-stores', current: 'blob list-stores' },
  { old: 'budgets overview', current: 'budgets inspect' },
  { old: 'buy add-on', current: 'buy addon' },
  { old: 'buy addons', current: 'buy addon' },
  { old: 'comments get', current: 'comments inspect' },
  { old: 'deploy-hooks add', current: 'deploy-hooks create' },
  { old: 'flags add', current: 'flags create' },
  { old: 'flags segments add', current: 'flags segments create' },
  { old: 'flags entities add', current: 'flags entities create' },
  { old: 'integration install', current: 'integration add' },
  {
    old: 'integration resource status',
    current: 'integration resource inspect',
  },
  {
    old: 'integration-resource status',
    current: 'integration resource inspect',
  },
  { old: 'kms get', current: 'kms inspect' },
  { old: 'kms rm-grant', current: 'kms remove-grant' },
  { old: 'kms delete-grant', current: 'kms remove-grant' },
  { old: 'monitors get', current: 'monitors inspect' },
  { old: 'project summary', current: 'project access-summary' },
  { old: 'project accessgroups', current: 'project access-groups' },
  { old: 'project priority-project', current: 'project priority' },
  { old: 'project unpause', current: 'project resume' },
  { old: 'redirects ls-versions', current: 'redirects list-versions' },
  { old: 'routes ls-versions', current: 'routes list-versions' },
  { old: 'teams access-request', current: 'teams request' },
  { old: 'teams change', current: 'teams switch' },
  { old: 'webhooks add', current: 'webhooks create' },
  { old: 'vcr get', current: 'vcr inspect' },
  { old: 'vcr tag get', current: 'vcr tag inspect' },
  { old: 'vcr image get', current: 'vcr image inspect' },
  // Without a version, `version use` stops before it installs anything.
  { old: 'version switch', current: 'version use', args: [] },
  { old: 'version install', current: 'version use', args: [] },
  { old: 'version upgrade', current: 'version update', args: [] },
  // Renamed to the guide's name.
  { old: 'routes reorder', current: 'routes move' },
  { old: 'firewall rules reorder', current: 'firewall rules move' },
  { old: 'redirects upload', current: 'redirects import' },
];

// No `.vercel` directory, so no command finds a linked project.
const cwd = mkdtempSync(join(tmpdir(), 'deprecated-aliases-'));

interface Run {
  exitCode: number | undefined;
  stdout: string;
  stderr: string;
}

// Runs the command the way `src/index.ts` does.
async function run(argv: string[]): Promise<Run> {
  client.reset();
  client.cwd = cwd;
  client.stdin.isTTY = false;
  client.setArgv(...argv);
  let exitCode: number | undefined;
  try {
    exitCode = await entryPoint(commands.get(argv[0]))!(client);
  } catch (err) {
    // The entry point exits 2 for an unknown option a command lets through,
    // and 1 for any other error.
    exitCode =
      err instanceof Error && 'code' in err && err.code === 'ARG_UNKNOWN_OPTION'
        ? 2
        : 1;
  } finally {
    // `vercel dev` refuses to run inside itself.
    delete process.env.__VERCEL_DEV_RUNNING;
  }
  return {
    exitCode,
    stdout: client.stdout.getFullOutput(),
    stderr: client.stderr.getFullOutput(),
  };
}

function argvFor(spelling: string, args: string[] = PLACEHOLDER) {
  return [...spelling.split(' '), ...args];
}

function warning({ old, current }: Row) {
  return `\`vercel ${old}\` is deprecated. Use \`vercel ${current}\`.`;
}

function count(text: string, part: string) {
  return text.split(part).length - 1;
}

describe('deprecated command names', () => {
  it.each(
    ROWS
  )('vercel $old warns once and runs like vercel $current', async row => {
    const current = await run(argvFor(row.current, row.args));
    const old = await run(argvFor(row.old, row.args));

    expect(count(old.stderr, warning(row))).toBe(1);
    expect(current.stderr).not.toContain(warning(row));
    expect({ exitCode: old.exitCode, stdout: old.stdout }).toEqual({
      exitCode: current.exitCode,
      stdout: current.stdout,
    });
  }, 20_000);

  it.each(ROWS)('vercel $old --json prints no warning', async row => {
    const { stderr } = await run([...argvFor(row.old, row.args), '--json']);
    expect(stderr).not.toContain(warning(row));
  }, 20_000);
});
