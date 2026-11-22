import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import rollingRelease from '../../../../src/commands/rolling-release';
import abortRollingRelease from '../../../../src/commands/rolling-release/abort-rolling-release';
import approveRollingRelease from '../../../../src/commands/rolling-release/approve-rolling-release';
import completeRollingRelease from '../../../../src/commands/rolling-release/complete-rolling-release';
import startRollingRelease from '../../../../src/commands/rolling-release/start-rolling-release';
import { isAPIError } from '../../../../src/util/errors-ts';
import { resolveProjectContext } from '../../../../src/util/projects/resolve-project-context';
import { client } from '../../../mocks/client';

vi.mock('../../../../src/util/projects/resolve-project-context');
vi.mock('../../../../src/commands/rolling-release/start-rolling-release');
vi.mock('../../../../src/commands/rolling-release/approve-rolling-release');
vi.mock('../../../../src/commands/rolling-release/abort-rolling-release');
vi.mock('../../../../src/commands/rolling-release/complete-rolling-release');
vi.mock('../../../../src/util/errors-ts', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../src/util/errors-ts')>()),
  isAPIError: vi.fn(),
}));

const mockedResolveProjectContext = vi.mocked(resolveProjectContext);
const actions = {
  start: vi.mocked(startRollingRelease),
  approve: vi.mocked(approveRollingRelease),
  abort: vi.mocked(abortRollingRelease),
  complete: vi.mocked(completeRollingRelease),
};

// Each subcommand that targets a deployment, with the other options it needs.
const cases = [
  ['start', []],
  ['approve', ['--currentStageIndex=0']],
  ['abort', []],
  ['complete', []],
] as const;

function optionEvents() {
  return client.telemetryEventStore.readonlyEvents
    .map(event => event.key)
    .filter(key => key === 'option:deployment' || key === 'option:dpl');
}

describe('rolling-release --deployment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockedResolveProjectContext.mockResolvedValue({
      status: 'linked',
      project: { id: 'prj_123', accountId: 'team_123' },
      org: { id: 'team_123', slug: 'my-team', type: 'team' },
    } as Awaited<ReturnType<typeof resolveProjectContext>>);
    for (const action of Object.values(actions)) {
      action.mockResolvedValue(0);
    }
  });

  it.each(
    cases
  )('%s targets the deployment given with --deployment', async (subcommand, extra) => {
    client.setArgv(
      'rolling-release',
      subcommand,
      '--deployment',
      'dpl_123',
      ...extra
    );

    expect(await rollingRelease(client)).toBe(0);
    expect(actions[subcommand]).toHaveBeenCalledWith(
      expect.objectContaining({ dpl: 'dpl_123' })
    );
    expect(client.stderr.getFullOutput()).not.toContain('deprecated');
    expect(optionEvents()).toEqual(['option:deployment']);
  });

  it.each(
    cases
  )('%s still accepts the deprecated --dpl with a warning', async (subcommand, extra) => {
    client.setArgv('rolling-release', subcommand, '--dpl=dpl_123', ...extra);

    expect(await rollingRelease(client)).toBe(0);
    expect(actions[subcommand]).toHaveBeenCalledWith(
      expect.objectContaining({ dpl: 'dpl_123' })
    );
    expect(client.stderr.getFullOutput()).toContain(
      '! --dpl is deprecated. Use --deployment.'
    );
    expect(optionEvents()).toEqual(['option:dpl']);
  });

  it.each(
    cases
  )('%s rejects --deployment with --dpl before resolving the project', async (subcommand, extra) => {
    client.setArgv(
      'rolling-release',
      subcommand,
      '--deployment',
      'dpl_123',
      '--dpl',
      'dpl_456',
      ...extra
    );

    expect(await rollingRelease(client)).toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      "Can't use --deployment with --dpl."
    );
    expect(mockedResolveProjectContext).not.toHaveBeenCalled();
    expect(actions[subcommand]).not.toHaveBeenCalled();
  });

  it.each(
    cases
  )('%s rejects an empty --deployment before resolving the project', async (subcommand, extra) => {
    client.setArgv('rolling-release', subcommand, '--deployment=', ...extra);

    expect(await rollingRelease(client)).toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      "--deployment can't be empty."
    );
    expect(mockedResolveProjectContext).not.toHaveBeenCalled();
    expect(actions[subcommand]).not.toHaveBeenCalled();
  });

  it('writes a JSON error for --deployment with --dpl in non-interactive mode', async () => {
    client.nonInteractive = true;
    client.setArgv(
      'rolling-release',
      'abort',
      '--deployment',
      'dpl_123',
      '--dpl',
      'dpl_456'
    );

    expect(await rollingRelease(client)).toBe(2);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'invalid_arguments',
      message: "Can't use --deployment with --dpl.",
    });
    expect(mockedResolveProjectContext).not.toHaveBeenCalled();
  });

  it.each([
    'abort',
    'complete',
  ] as const)('%s names --deployment when it is missing', async subcommand => {
    client.setArgv('rolling-release', subcommand);

    expect(await rollingRelease(client)).toBe(2);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Missing required option --deployment');
    expect(stderr).not.toContain('--dpl');
  });

  describe('in non-interactive mode', () => {
    beforeEach(() => {
      client.nonInteractive = true;
      vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('suggests --deployment when it is missing', async () => {
      client.setArgv('rolling-release', 'start', '--non-interactive');

      await rollingRelease(client);
      expect(process.exit).toHaveBeenCalledWith(1);
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.message).toBe(
        'Starting a rolling release in non-interactive mode requires the --deployment option.'
      );
      expect(payload.next).toEqual([
        { command: 'vercel ls' },
        {
          command:
            'vercel rolling-release start --deployment dpl_123 --non-interactive',
        },
      ]);
    });

    it.each([
      '--project',
      '-p',
    ])('lists the deployments of the project given with %s', async flag => {
      client.setArgv('rolling-release', 'start', flag, 'my-app');

      await rollingRelease(client);
      expect(process.exit).toHaveBeenCalledWith(1);
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.next).toEqual([
        { command: 'vercel ls my-app' },
        {
          command: `vercel rolling-release start ${flag} my-app --deployment dpl_123`,
        },
      ]);
    });

    it('suggests --deployment when --dpl was used', async () => {
      vi.mocked(isAPIError).mockReturnValue(true);
      actions.abort.mockRejectedValue(new Error('Deployment not found'));
      client.setArgv(
        'rolling-release',
        'abort',
        '--dpl',
        'dpl_123',
        '--non-interactive'
      );

      await rollingRelease(client);
      expect(process.exit).toHaveBeenCalledWith(1);
      const payload = JSON.parse(client.stdout.getFullOutput());
      const commands: string[] = payload.next.map(
        (next: { command: string }) => next.command
      );
      expect(commands[1]).toMatch(
        /^vercel rolling-release abort --deployment dpl_123 /
      );
      for (const command of commands) {
        expect(command).not.toContain('--dpl');
      }
    });
  });
});
