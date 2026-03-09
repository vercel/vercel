import { describe, expect, it, beforeEach, vi } from 'vitest';
import open from 'open';
import flags from '../../../../src/commands/flags';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import { defaultFlags, useFlags } from '../../../mocks/flags';

vi.mock('open', () => {
  return {
    default: vi.fn(),
  };
});

const openMock = vi.mocked(open);

describe('flags open', () => {
  let teamSlug: string;

  beforeEach(() => {
    openMock.mockClear();
    openMock.mockResolvedValue(undefined as never);
    useUser();
    const teamsResult = useTeams('team_dummy');
    teamSlug = Array.isArray(teamsResult)
      ? teamsResult[0].slug
      : teamsResult.teams[0].slug;
    useProject({
      ...defaultProject,
      id: 'vercel-flags-test',
      name: 'vercel-flags-test',
    });
    useFlags();
    const cwd = setupUnitFixture('commands/flags/vercel-flags-test');
    client.cwd = cwd;
    (client.stdout as any).isTTY = true;
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'flags';
      const subcommand = 'open';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = flags(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:${subcommand}`,
        },
      ]);
    });
  });

  it('tracks subcommand usage', async () => {
    client.setArgv('flags', 'open', defaultFlags[0].slug);
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:open',
        value: 'open',
      },
      {
        key: 'argument:flag',
        value: '[REDACTED]',
      },
    ]);
  });

  it('opens the project flags dashboard on TTY', async () => {
    client.setArgv('flags', 'open');

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput(
      'Opening feature flags dashboard in your browser...'
    );
    await expect(client.stderr).toOutput(
      `Visit this URL if the browser does not open: https://vercel.com/${teamSlug}/vercel-flags-test/flags`
    );
    expect(openMock).toHaveBeenCalledWith(
      `https://vercel.com/${teamSlug}/vercel-flags-test/flags`
    );
  });

  it('opens a specific flag dashboard when a flag is provided', async () => {
    client.setArgv('flags', 'open', defaultFlags[0].id);

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput(
      `Visit this URL if the browser does not open: https://vercel.com/${teamSlug}/vercel-flags-test/flag/${defaultFlags[0].slug}`
    );
    expect(openMock).toHaveBeenCalledWith(
      `https://vercel.com/${teamSlug}/vercel-flags-test/flag/${defaultFlags[0].slug}`
    );
  });

  it('prints the URL to stdout instead of opening the browser in non-tty mode', async () => {
    client.setArgv('flags', 'open', defaultFlags[0].slug);
    (client.stdout as any).isTTY = false;

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(openMock).not.toHaveBeenCalled();
    await expect(client.stdout).toOutput(
      `https://vercel.com/${teamSlug}/vercel-flags-test/flag/${defaultFlags[0].slug}`
    );
  });

  it('errors when too many arguments are provided', async () => {
    client.setArgv('flags', 'open', 'one', 'two');

    const exitCodePromise = flags(client);

    await expect(client.stderr).toOutput('Error: Too many arguments.');
    await expect(exitCodePromise).resolves.toEqual(1);
    expect(openMock).not.toHaveBeenCalled();
  });
});
