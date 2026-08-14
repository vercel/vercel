import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import integration from '../../../../src/commands/integration';
import { client } from '../../../mocks/client';
import * as getScopeModule from '../../../../src/util/get-scope';

vi.mock('../../../../src/util/get-scope');
const mockedGetScope = vi.mocked(getScopeModule.default);

describe('integration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockedGetScope.mockResolvedValue({
      contextName: 'my-team',
      team: { id: 'team_dummy', slug: 'my-team' } as any,
      user: { id: 'user_dummy' } as any,
    });
  });
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'integration';

      client.setArgv(command, '--help');
      const exitCodePromise = integration(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: command,
        },
      ]);
    });
  });

  it('errors when invoked without subcommand', async () => {
    client.setArgv('integration');
    const exitCodePromise = integration(client);
    await expect(exitCodePromise).resolves.toBe(2);
    await expect(client.stderr).toOutput('Please specify a valid subcommand');
  });

  describe('unrecognized subcommand', () => {
    it('shows help', async () => {
      const args: string[] = ['not-a-command'];

      client.setArgv('integration', ...args);
      const exitCode = await integration(client);
      expect(exitCode).toEqual(2);
      await expect(client.stderr).toOutput('Unknown subcommand');
    });
  });

  it('writes structured JSON to stdout when non-interactive and subcommand is missing', async () => {
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code ?? 0}`);
    }) as () => never);
    client.nonInteractive = true;
    client.setArgv('integration', '--non-interactive', '--cwd', '/tmp/example');
    await expect(integration(client)).rejects.toThrow('exit:2');
    const payload = JSON.parse(client.stdout.getFullOutput().trim());
    expect(payload).toMatchObject({
      status: 'error',
      reason: 'missing_arguments',
    });
    expect(payload.message).toMatch(/Please specify a valid subcommand/);
    expect(payload.next?.[0]?.command).toMatch(
      /vercel --non-interactive --cwd \/tmp\/example integration --help$/
    );
    expect(payload.next?.[1]?.command).toBe(
      'vercel --non-interactive --cwd /tmp/example integration installations'
    );
  });

  it('writes structured JSON for unknown subcommand in non-interactive mode', async () => {
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code ?? 0}`);
    }) as () => never);
    client.nonInteractive = true;
    client.setArgv('integration', 'typo', '--non-interactive');
    await expect(integration(client)).rejects.toThrow('exit:2');
    const payload = JSON.parse(client.stdout.getFullOutput().trim());
    expect(payload).toMatchObject({
      status: 'error',
      reason: 'invalid_arguments',
    });
    expect(payload.message).toContain('typo');
    expect(payload.next?.[0]?.command).toMatch(
      /vercel --non-interactive integration --help$/
    );
    expect(payload.next).toHaveLength(1);
  });

  it('lists marketplace installations for the current team', async () => {
    client.scenario.get('/v2/integrations/configurations', (req, res) => {
      expect(req.query.view).toBe('account');
      expect(req.query.installationType).toBe('marketplace');
      res.json([
        {
          id: 'icfg_1',
          integration: { slug: 'neon' },
          ownerId: 'user_x',
        },
      ]);
    });

    client.setArgv('integration', 'installations');

    const exitCode = await integration(client);

    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).toContain('icfg_1');
    expect(client.stderr.getFullOutput()).toContain('neon');
  });

  it('errors when integration installations is given extra positional arguments', async () => {
    client.setArgv('integration', 'installations', 'typo');
    const exitCode = await integration(client);
    expect(exitCode).toBe(1);
    await expect(client.stderr).toOutput('Invalid number of arguments');
  });
});
