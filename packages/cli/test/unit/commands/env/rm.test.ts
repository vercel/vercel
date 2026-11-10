import { describe, it, expect, beforeEach, vi } from 'vitest';
import env from '../../../../src/commands/env';
import {
  setupTmpDir,
  setupUnitFixture,
} from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import param from '../../../../src/util/output/param';

describe('env rm', () => {
  beforeEach(() => {
    useUser();
    useTeams('team_dummy');
    useProject(
      {
        ...defaultProject,
        id: 'vercel-env-rm',
        name: 'vercel-env-rm',
      },
      [
        {
          type: 'encrypted',
          id: '781dt89g8r2h789g',
          key: 'ENVIRONMENT_NAME',
          value: 'redis://abc123@redis.example.dev:6379',
          target: ['development'],
          gitBranch: undefined,
          configurationId: null,
          updatedAt: 1557241361455,
          createdAt: 1557241361455,
        },
      ]
    );
    const cwd = setupUnitFixture('commands/env/vercel-env-rm');
    client.cwd = cwd;
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'env';
      const subcommand = 'rm';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = env(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:${subcommand}`,
        },
      ]);
    });
  });

  it('removes a variable from the project selected by --project', async () => {
    client.cwd = setupTmpDir();
    client.config.currentTeam = 'team_dummy';
    useProject(
      {
        ...defaultProject,
        id: 'explicit-env-rm',
        name: 'explicit-env-rm',
        accountId: 'team_dummy',
      },
      [
        {
          type: 'encrypted',
          id: 'explicit-env',
          key: 'ENVIRONMENT_NAME',
          value: 'value',
          target: ['development'],
          gitBranch: undefined,
          configurationId: null,
          updatedAt: 1557241361455,
          createdAt: 1557241361455,
        },
      ]
    );
    client.setArgv(
      'env',
      'rm',
      'ENVIRONMENT_NAME',
      'development',
      '--yes',
      '--project',
      'explicit-env-rm'
    );

    await expect(env(client)).resolves.toEqual(0);
  });

  it.each([
    {
      name: 'standard siblings',
      target: ['production', 'preview', 'development'],
      custom: [],
      selected: 'preview',
      remaining: ['production', 'development'],
      method: 'PATCH',
    },
    {
      name: 'custom siblings',
      target: ['preview'],
      custom: ['env_custom'],
      selected: 'preview',
      remaining: [],
      method: 'PATCH',
    },
    {
      name: 'single target',
      target: ['preview'],
      custom: [],
      selected: 'preview',
      remaining: [],
      method: 'DELETE',
    },
    {
      name: 'unqualified record',
      target: ['production', 'preview'],
      custom: [],
      selected: undefined,
      remaining: [],
      method: 'DELETE',
    },
  ])('preserves target scope: $name', async ({
    target,
    custom,
    selected,
    remaining,
    method,
  }) => {
    client.cwd = setupTmpDir();
    client.config.currentTeam = 'team_dummy';
    useProject(
      {
        ...defaultProject,
        id: 'target-safety',
        name: 'target-safety',
        accountId: 'team_dummy',
      },
      [
        {
          type: 'encrypted',
          id: 'env_synthetic',
          key: 'API_URL',
          value: 'https://example.test',
          target: target as ('production' | 'preview' | 'development')[],
          customEnvironmentIds: custom,
          gitBranch: undefined,
          configurationId: null,
          updatedAt: 1,
          createdAt: 1,
        },
      ]
    );
    const fetchSpy = vi.spyOn(client, 'fetch');
    fetchSpy.mockClear();
    client.setArgv(
      'env',
      'rm',
      'API_URL',
      ...(selected ? [selected] : []),
      '--yes',
      '--project',
      'target-safety'
    );
    await expect(env(client)).resolves.toBe(0);
    const mutations = fetchSpy.mock.calls.filter(
      ([, options]) =>
        options?.method === 'PATCH' || options?.method === 'DELETE'
    );
    expect(
      mutations.map(([url, options]) => [
        url,
        {
          method: options?.method,
          ...(options?.body ? { body: options.body } : {}),
        },
      ])
    ).toEqual([
      [
        '/v10/projects/target-safety/env/env_synthetic',
        method === 'PATCH'
          ? {
              method: 'PATCH',
              body: { target: remaining, customEnvironmentIds: custom },
            }
          : { method: 'DELETE' },
      ],
    ]);
    // Exact request assertions above exclude values, keys, and types from PATCH.
  });

  it.each([
    {
      name: 'qualified removal',
      selected: 'preview',
      environments: 'Preview',
    },
    {
      name: 'unqualified removal',
      selected: undefined,
      environments: 'Production, Preview, Development',
    },
  ])('confirms the scope of a $name', async ({ selected, environments }) => {
    client.cwd = setupTmpDir();
    client.config.currentTeam = 'team_dummy';
    useProject(
      {
        ...defaultProject,
        id: 'confirmation-scope',
        name: 'confirmation-scope',
        accountId: 'team_dummy',
      },
      [
        {
          type: 'encrypted',
          id: 'env_confirmation',
          key: 'API_URL',
          value: 'https://example.test',
          target: ['production', 'preview', 'development'],
          gitBranch: undefined,
          configurationId: null,
          updatedAt: 1,
          createdAt: 1,
        },
      ]
    );
    const confirmSpy = vi
      .spyOn(client.input, 'confirm')
      .mockResolvedValueOnce(true);
    client.setArgv(
      'env',
      'rm',
      'API_URL',
      ...(selected ? [selected] : []),
      '--project',
      'confirmation-scope'
    );

    await expect(env(client)).resolves.toBe(0);
    expect(confirmSpy).toHaveBeenCalledWith(
      `Remove ${param('API_URL')} from ${environments} in Project confirmation-scope?`,
      false
    );
  });

  it('warns that deleting a credential does not revoke it', async () => {
    client.cwd = setupTmpDir();
    client.config.currentTeam = 'team_dummy';
    useProject(
      {
        ...defaultProject,
        id: 'explicit-secret-rm',
        name: 'explicit-secret-rm',
        accountId: 'team_dummy',
      },
      [
        {
          type: 'sensitive',
          visibility: 'secret',
          id: 'secret-rm-id',
          key: 'STRIPE_SECRET_KEY',
          value: '',
          target: ['production'],
          gitBranch: undefined,
          configurationId: null,
          updatedAt: 1557241361455,
          createdAt: 1557241361455,
        },
      ]
    );
    client.setArgv(
      'env',
      'rm',
      'STRIPE_SECRET_KEY',
      '--yes',
      '--project',
      'explicit-secret-rm'
    );

    const exitCodePromise = env(client);
    await expect(client.stderr).toOutput(
      '! Removing this variable from Vercel does not revoke the credential'
    );
    await expect(exitCodePromise).resolves.toBe(0);
  });

  describe('non-interactive', () => {
    it('outputs action_required with missing_name when name not provided', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      client.nonInteractive = true;
      client.setArgv(
        'env',
        'rm',
        '--non-interactive',
        '--cwd=../../../test-custom-deployment-id'
      );
      const exitCodePromise = env(client);

      await expect(exitCodePromise).rejects.toThrow('exit');
      expect(logSpy).toHaveBeenCalled();
      const payload = JSON.parse(
        logSpy.mock.calls[logSpy.mock.calls.length - 1][0]
      );
      expect(payload).toMatchObject({
        status: 'action_required',
        reason: 'missing_name',
        message: expect.stringMatching(/name|Example/),
        next: expect.any(Array),
      });
      expect(payload.next[0].command).toMatch(/env remove/);
      expect(payload.next[0].command).toContain('--yes');
      expect(payload.next[0].command).toContain('--non-interactive');

      exitSpy.mockRestore();
      logSpy.mockRestore();
    });
  });

  describe('--environment and --git-branch', () => {
    describe('an empty --environment', () => {
      beforeEach(() => {
        client.cwd = setupTmpDir();
        client.config.currentTeam = 'team_dummy';
        useProject(
          {
            ...defaultProject,
            id: 'shared-env-rm',
            name: 'shared-env-rm',
            accountId: 'team_dummy',
          },
          [
            {
              type: 'encrypted',
              id: 'shared-env',
              key: 'SHARED_TOKEN',
              value: 'value',
              target: ['production', 'preview'],
              gitBranch: undefined,
              configurationId: null,
              updatedAt: 1557241361455,
              createdAt: 1557241361455,
            },
          ]
        );
      });

      it.each([
        [['--environment=']],
        [['--environment', '']],
      ])('fails with %j before sending any request', async args => {
        const fetchSpy = vi.spyOn(client, 'fetch');
        fetchSpy.mockClear();
        client.setArgv(
          'env',
          'rm',
          'SHARED_TOKEN',
          ...args,
          '--yes',
          '--project',
          'shared-env-rm'
        );

        await expect(env(client)).resolves.toEqual(2);
        expect(fetchSpy).not.toHaveBeenCalled();
        const stderr = client.stderr.getFullOutput();
        expect(stderr).toContain(
          "Can't remove an Environment Variable with an empty --environment."
        );
        expect(stderr).not.toContain('Removed');
        fetchSpy.mockRestore();
      });

      it('reports invalid_environment in non-interactive mode', async () => {
        const fetchSpy = vi.spyOn(client, 'fetch');
        fetchSpy.mockClear();
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
          throw new Error('exit');
        });
        client.nonInteractive = true;
        client.setArgv(
          'env',
          'rm',
          'SHARED_TOKEN',
          '--environment=',
          '--yes',
          '--project',
          'shared-env-rm'
        );

        await expect(env(client)).rejects.toThrow('exit');
        expect(exitSpy).toHaveBeenCalledWith(2);
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
          status: 'error',
          reason: 'invalid_environment',
        });

        exitSpy.mockRestore();
        fetchSpy.mockRestore();
        client.nonInteractive = false;
      });
    });

    it.each([
      ['--environment', 'development'],
      ['-e', 'development'],
    ])('removes the variable from the environment given with %s', async (...args) => {
      client.setArgv('env', 'rm', 'ENVIRONMENT_NAME', ...args, '--yes');
      await expect(env(client)).resolves.toEqual(0);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('Removed Environment Variable');
      expect(stderr).not.toContain('deprecated');
    });

    it('keeps the environment and Git branch arguments working with deprecation warnings', async () => {
      client.setArgv(
        'env',
        'rm',
        'ENVIRONMENT_NAME',
        'development',
        'main',
        '--yes'
      );
      await expect(env(client)).resolves.toEqual(0);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain(
        'The environment argument is deprecated. Use --environment.'
      );
      expect(stderr).toContain(
        'The Git branch argument is deprecated. Use --git-branch.'
      );
    });

    it('rejects an environment given both ways', async () => {
      client.setArgv(
        'env',
        'rm',
        'ENVIRONMENT_NAME',
        'preview',
        '--environment',
        'development',
        '--yes'
      );
      await expect(env(client)).resolves.toEqual(2);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain(
        "Can't use an environment argument with --environment."
      );
      expect(stderr).not.toContain('Removed');
    });

    it('keeps env-only options out of the link suggestion when not linked', async () => {
      const linkModule = await import('../../../../src/util/projects/link');
      vi.spyOn(linkModule, 'getLinkedProject').mockResolvedValue({
        status: 'not_linked',
        org: null,
        project: null,
      });
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      client.nonInteractive = true;
      client.setArgv(
        'env',
        'rm',
        'VAR',
        '--environment',
        'preview',
        '--git-branch',
        'feat-1',
        '--yes',
        '--cwd=/tmp',
        '--non-interactive'
      );

      await expect(env(client)).rejects.toThrow('exit');
      const payload = JSON.parse(
        logSpy.mock.calls[logSpy.mock.calls.length - 1][0]
      );
      const [linkCommand, retryCommand] = payload.next.map(
        (next: { command: string }) => next.command
      );
      expect(linkCommand).toMatch(/vercel link --scope <scope>/);
      expect(linkCommand).toContain('--cwd=/tmp');
      expect(linkCommand).not.toMatch(/--environment|-e |--git-branch|feat-1/);
      expect(retryCommand).toMatch(
        /env rm VAR --environment preview --git-branch feat-1/
      );

      exitSpy.mockRestore();
      logSpy.mockRestore();
      vi.restoreAllMocks();
    });

    it('tracks --environment and --git-branch as options', async () => {
      client.setArgv(
        'env',
        'rm',
        'ENVIRONMENT_NAME',
        '--environment',
        'development',
        '--git-branch',
        'main',
        '--yes'
      );
      await env(client);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:rm', value: 'rm' },
        { key: 'argument:name', value: '[REDACTED]' },
        { key: 'option:environment', value: 'development' },
        { key: 'option:git-branch', value: '[REDACTED]' },
        { key: 'flag:yes', value: 'TRUE' },
      ]);
    });
  });

  describe('[name]', () => {
    describe('--yes', () => {
      it('tracks [name] and `--yes`', async () => {
        client.setArgv('env', 'rm', 'ENVIRONMENT_NAME', '--yes');
        await env(client);
        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: `subcommand:rm`,
            value: 'rm',
          },
          {
            key: `argument:name`,
            value: '[REDACTED]',
          },
          {
            key: `flag:yes`,
            value: 'TRUE',
          },
        ]);
      });
    });

    describe('[environment]', () => {
      describe('[git-branch]', () => {
        it('tracks `[environment]` and `[git-branch]` arguments', async () => {
          client.setArgv(
            'env',
            'rm',
            'ENVIRONMENT_NAME',
            'development',
            'main',
            '--yes'
          );
          await env(client);
          expect(client.telemetryEventStore).toHaveTelemetryEvents([
            {
              key: `subcommand:rm`,
              value: 'rm',
            },
            {
              key: `argument:name`,
              value: '[REDACTED]',
            },
            {
              key: `argument:environment`,
              value: 'development',
            },
            {
              key: `argument:git-branch`,
              value: '[REDACTED]',
            },
            {
              key: `flag:yes`,
              value: 'TRUE',
            },
          ]);
        });
      });
    });
  });
});
