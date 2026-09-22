import { join } from 'path';
import { outputFile } from 'fs-extra';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Project, User } from '@vercel-internals/types';
import project from '../../../../src/commands/project';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeam } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

function useSettingsProject(
  settings: Partial<Project>,
  onPatch?: (body: unknown) => void,
  normalizePatchedProject?: (project: Project) => void,
  beforeProjectGet?: (project: Project, requestCount: number) => void
) {
  const currentProject: Project = {
    ...defaultProject,
    id: 'prj_123',
    name: 'my-project',
    accountId: client.config.currentTeam ?? defaultProject.accountId,
    ...settings,
  };

  let getRequestCount = 0;
  client.scenario.get('/v9/projects/:idOrName', (req, res) => {
    if (
      req.params.idOrName !== currentProject.id &&
      req.params.idOrName !== currentProject.name
    ) {
      return res.status(404).send();
    }
    beforeProjectGet?.(currentProject, ++getRequestCount);
    res.json(currentProject);
  });
  client.scenario.patch('/v9/projects/prj_123', (req, res) => {
    onPatch?.(req.body);
    Object.assign(currentProject, req.body);
    normalizePatchedProject?.(currentProject);
    res.json(currentProject);
  });

  return currentProject;
}

function billing(plan: string): User['billing'] {
  return { plan } as User['billing'];
}

function useScope(plan?: string) {
  client.config.currentTeam = 'team_scope';
  useUser();
  client.scenario.get('/teams/team_scope', (_req, res) => {
    res.json({
      id: 'team_scope',
      slug: 'scope-team',
      name: 'Scope Team',
      ...(plan ? { billing: { plan } } : {}),
    });
  });
}

async function confirmUpdatePrompt(answer = 'y') {
  await expect(client.stderr).toOutput('Update ');
  client.stdin.write(`${answer}\n`);
}

describe('project update', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    client.nonInteractive = false;
  });

  describe('--help', () => {
    it('documents the framework option and tracks telemetry', async () => {
      client.setArgv('project', 'update', '--help');

      await expect(project(client)).resolves.toBe(0);

      const helpOutput = client.stderr.getFullOutput();
      expect(helpOutput).toContain('--framework');
      expect(helpOutput).toContain('--build-command');
      expect(helpOutput).toContain('--dev-command');
      expect(helpOutput).toContain('--install-command');
      expect(helpOutput).toContain('--output-directory');
      expect(helpOutput).toContain('--auto-detect');
      expect(helpOutput).toContain('--fluid-compute');
      expect(helpOutput).toContain('--function-cpu');
      expect(helpOutput).toContain('--sandbox-region');
      expect(helpOutput).toContain('--build-machine');
      expect(helpOutput).toContain('--elastic-concurrency');
      expect(helpOutput).toContain('--node-version');
      expect(helpOutput).toContain('--json');
      expect(helpOutput).toContain('--yes');
      expect(helpOutput).toContain('Apply settings that do not affect');
      expect(helpOutput).toContain('charges without prompting');
      expect(helpOutput).toContain('omitted settings remain unchanged');
      expect(helpOutput).toContain('Update multiple settings in one command');
      expect(helpOutput).toContain(
        'Reset individual settings to automatic detection'
      );
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'project:update',
        },
      ]);
    });

    it('is discoverable from project help', async () => {
      client.setArgv('project', '--help');

      await expect(project(client)).resolves.toBe(0);

      expect(client.stderr.getFullOutput()).toContain('update');
      expect(client.stderr.getFullOutput()).toContain(
        'Update one or more project settings'
      );
    });
  });

  it('updates a named project framework preset', async () => {
    const currentProject = useSettingsProject(
      { framework: 'nextjs', buildCommand: 'pnpm build' },
      body => {
        expect(body).toEqual({ framework: 'vite' });
      }
    );

    client.setArgv('project', 'update', 'my-project', '--framework', 'vite');
    const exitCodePromise = project(client);
    await confirmUpdatePrompt();
    const exitCode = await exitCodePromise;

    expect(exitCode).toBe(0);
    expect(currentProject.framework).toBe('vite');
    expect(currentProject.buildCommand).toBe('pnpm build');
    expect(client.stdout.getFullOutput()).toBe('');
    expect(client.stderr.getFullOutput()).toContain(
      'Updated         Project Settings'
    );
    expect(client.stderr.getFullOutput()).toContain(
      'Project         my-project'
    );
    expect(client.stderr.getFullOutput()).toContain(
      'Next.js (nextjs) → Vite (vite)'
    );
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:update',
        value: 'update',
      },
      {
        key: 'argument:name',
        value: '[REDACTED]',
      },
      {
        key: 'option:framework',
        value: '[REDACTED]',
      },
    ]);
  });

  it('accepts the "set" alias', async () => {
    useSettingsProject({ framework: 'nextjs' }, body => {
      expect(body).toEqual({ framework: 'vite' });
    });

    client.setArgv('project', 'set', 'my-project', '--framework', 'vite');
    const exitCodePromise = project(client);
    await confirmUpdatePrompt();
    const exitCode = await exitCodePromise;

    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).toContain(
      'Next.js (nextjs) → Vite (vite)'
    );
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:update',
        value: 'set',
      },
      {
        key: 'argument:name',
        value: '[REDACTED]',
      },
      {
        key: 'option:framework',
        value: '[REDACTED]',
      },
    ]);
  });

  it('returns a stable JSON result on stdout', async () => {
    useSettingsProject({ framework: 'nextjs' });

    client.setArgv(
      'project',
      'update',
      'my-project',
      '--framework',
      'vite',
      '--json'
    );
    const exitCodePromise = project(client);
    await confirmUpdatePrompt();
    const exitCode = await exitCodePromise;

    expect(exitCode).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput().trim())).toEqual({
      changed: true,
      changedSettings: ['framework'],
      projectId: 'prj_123',
      projectName: 'my-project',
      settings: {
        framework: 'vite',
      },
    });
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:update',
        value: 'update',
      },
      {
        key: 'argument:name',
        value: '[REDACTED]',
      },
      {
        key: 'option:framework',
        value: '[REDACTED]',
      },
      {
        key: 'flag:json',
        value: 'TRUE',
      },
    ]);
  });

  it('updates all framework settings in one PATCH', async () => {
    const currentProject = useSettingsProject(
      {
        framework: 'vite',
        buildCommand: null,
        devCommand: 'vite dev',
        installCommand: null,
        outputDirectory: 'dist',
      },
      body => {
        expect(body).toEqual({
          framework: 'nextjs',
          buildCommand: 'next build',
          devCommand: 'next dev',
          installCommand: 'pnpm install',
          outputDirectory: '.next',
        });
      }
    );

    client.setArgv(
      'project',
      'update',
      'my-project',
      '--framework',
      'nextjs',
      '--build-command',
      'next build',
      '--dev-command',
      'next dev',
      '--install-command',
      'pnpm install',
      '--output-directory',
      '.next'
    );
    const exitCodePromise = project(client);
    await confirmUpdatePrompt();
    const exitCode = await exitCodePromise;

    expect(exitCode).toBe(0);
    expect(currentProject).toMatchObject({
      framework: 'nextjs',
      buildCommand: 'next build',
      devCommand: 'next dev',
      installCommand: 'pnpm install',
      outputDirectory: '.next',
    });
    const humanOutput = client.stderr.getFullOutput();
    expect(humanOutput).toContain('Vite (vite) → Next.js (nextjs)');
    expect(humanOutput).toContain('Auto → next build');
    expect(humanOutput).toContain('vite dev → next dev');
    expect(humanOutput).toContain('Auto → pnpm install');
    expect(humanOutput).toContain('dist → .next');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:update', value: 'update' },
      { key: 'argument:name', value: '[REDACTED]' },
      { key: 'option:framework', value: '[REDACTED]' },
      { key: 'option:build-command', value: '[REDACTED]' },
      { key: 'option:dev-command', value: '[REDACTED]' },
      { key: 'option:install-command', value: '[REDACTED]' },
      { key: 'option:output-directory', value: '[REDACTED]' },
    ]);
  });

  it('resets selected settings to automatic detection', async () => {
    const currentProject = useSettingsProject(
      {
        framework: 'nextjs',
        buildCommand: 'pnpm build',
        outputDirectory: 'dist',
      },
      body => {
        expect(body).toEqual({
          buildCommand: null,
          outputDirectory: null,
        });
      }
    );

    client.setArgv(
      'project',
      'update',
      'my-project',
      '--auto-detect',
      'build-command',
      '--auto-detect',
      'output-directory'
    );
    const exitCodePromise = project(client);
    await confirmUpdatePrompt();
    const exitCode = await exitCodePromise;

    expect(exitCode).toBe(0);
    expect(currentProject.buildCommand).toBeNull();
    expect(currentProject.outputDirectory).toBeNull();
    expect(client.stderr.getFullOutput()).toContain('pnpm build → Auto');
    expect(client.stderr.getFullOutput()).toContain('dist → Auto');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:update', value: 'update' },
      { key: 'argument:name', value: '[REDACTED]' },
      { key: 'option:auto-detect', value: '[REDACTED]' },
    ]);
  });

  it('maps the Other preset to null', async () => {
    const currentProject = useSettingsProject({ framework: 'nextjs' }, body => {
      expect(body).toEqual({ framework: null });
    });

    client.setArgv('project', 'update', 'my-project', '--framework', 'other');
    const exitCodePromise = project(client);
    await confirmUpdatePrompt();
    const exitCode = await exitCodePromise;

    expect(exitCode).toBe(0);
    expect(currentProject.framework).toBeNull();
    expect(client.stderr.getFullOutput()).toContain('Other (other)');
  });

  it('accepts framework slugs case-insensitively', async () => {
    const currentProject = useSettingsProject({ framework: 'vite' }, body => {
      expect(body).toEqual({ framework: 'nextjs' });
    });

    client.setArgv('project', 'update', 'my-project', '--framework', 'NextJS');
    const exitCodePromise = project(client);
    await confirmUpdatePrompt();
    const exitCode = await exitCodePromise;

    expect(exitCode).toBe(0);
    expect(currentProject.framework).toBe('nextjs');
  });

  it('reports an unchanged preset without sending a PATCH', async () => {
    const currentProject: Project = {
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
      framework: null,
    };
    client.scenario.get('/v9/projects/my-project', (_req, res) => {
      res.json(currentProject);
    });

    client.setArgv(
      'project',
      'update',
      'my-project',
      '--framework',
      'other',
      '--json'
    );
    const exitCode = await project(client);

    expect(exitCode).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput().trim())).toEqual({
      changed: false,
      changedSettings: [],
      projectId: 'prj_123',
      projectName: 'my-project',
      settings: {
        framework: null,
      },
    });
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it('updates the linked project when no name is provided', async () => {
    const team = useTeam('team_linked');
    useUser();
    useProject({
      ...defaultProject,
      id: 'prj_linked',
      name: 'linked-project',
      accountId: team.id,
      framework: 'nextjs',
    });

    const cwd = setupTmpDir();
    await outputFile(
      join(cwd, '.vercel', 'project.json'),
      JSON.stringify({ orgId: team.id, projectId: 'prj_linked' })
    );
    client.cwd = cwd;
    const fetchSpy = vi.spyOn(client, 'fetch');

    client.setArgv('project', 'update', '--framework', 'vite');
    const exitCodePromise = project(client);
    await confirmUpdatePrompt();
    const exitCode = await exitCodePromise;

    expect(exitCode).toBe(0);
    const patchCall = fetchSpy.mock.calls.find(
      ([path, options]) =>
        path === '/v9/projects/prj_linked' && options?.method === 'PATCH'
    );
    expect(patchCall?.[1]).toMatchObject({
      body: { framework: 'vite' },
    });
    expect(client.stderr.getFullOutput()).toContain('linked-project');
  });

  it('rejects an unsupported framework before resolving a project', async () => {
    client.setArgv('project', 'update', 'my-project', '--framework', 'next-js');
    const exitCode = await project(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Unsupported framework preset "next-js"'
    );
    expect(client.stderr.getFullOutput()).toContain('Did you mean "nextjs"?');
    expect(client.stdout.getFullOutput()).toBe('');
  });

  it('rejects conflicting explicit and auto-detected settings', async () => {
    client.setArgv(
      'project',
      'update',
      'my-project',
      '--build-command',
      'pnpm build',
      '--auto-detect',
      'build-command'
    );
    const exitCode = await project(client);

    expect(exitCode).toBe(2);
    expect(client.stderr.getFullOutput()).toContain('Choose one');
    expect(client.stdout.getFullOutput()).toBe('');
  });

  it('rejects an unknown auto-detect setting before resolving a project', async () => {
    client.setArgv(
      'project',
      'update',
      'my-project',
      '--auto-detect',
      'build-commandz'
    );
    const exitCode = await project(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Unknown auto-detect setting "build-commandz"'
    );
    expect(client.stderr.getFullOutput()).toContain(
      'Did you mean "build-command"?'
    );
  });

  it('validates setting values before resolving a project', async () => {
    client.setArgv(
      'project',
      'update',
      'my-project',
      '--build-command',
      'x'.repeat(257)
    );
    const exitCode = await project(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Build Command must be 256 characters or fewer'
    );
  });

  it('requires at least one setting option', async () => {
    client.setArgv('project', 'update', 'my-project');

    await expect(project(client)).resolves.toBe(2);

    expect(client.stderr.getFullOutput()).toContain(
      'Provide at least one setting option'
    );
  });

  it('rejects more than one project argument', async () => {
    client.setArgv('project', 'update', 'one', 'two', '--framework', 'nextjs');

    await expect(project(client)).resolves.toBe(2);

    expect(client.stderr.getFullOutput()).toContain(
      'Invalid number of arguments'
    );
  });

  describe('sandbox regions', () => {
    it('preserves failover regions when only the primary region changes', async () => {
      let patchBody: unknown;
      const currentProject = useSettingsProject(
        { sandbox: { region: 'iad1', failoverRegions: ['sfo1'] } },
        body => {
          patchBody = body;
        }
      );

      client.setArgv(
        'project',
        'update',
        'my-project',
        '--sandbox-region',
        'cle1'
      );

      const exitCodePromise = project(client);
      await confirmUpdatePrompt();
      await expect(exitCodePromise).resolves.toBe(0);

      expect(patchBody).toEqual({
        sandbox: { region: 'cle1', failoverRegions: ['sfo1'] },
      });
      expect(currentProject.sandbox).toEqual({
        region: 'cle1',
        failoverRegions: ['sfo1'],
      });
      expect(client.stderr.getFullOutput()).toContain('iad1 → cle1');
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:update',
          value: 'update',
        },
        {
          key: 'argument:name',
          value: '[REDACTED]',
        },
        {
          key: 'option:sandbox-region',
          value: '[REDACTED]',
        },
      ]);
    });

    it('clears the primary region with an empty string', async () => {
      let patchBody: unknown;
      useSettingsProject({ sandbox: { region: 'sfo1' } }, body => {
        patchBody = body;
      });

      client.setArgv('project', 'update', 'my-project', '--sandbox-region', '');

      const exitCodePromise = project(client);
      await confirmUpdatePrompt();
      await expect(exitCodePromise).resolves.toBe(0);

      expect(patchBody).toEqual({ sandbox: {} });
      expect(client.stderr.getFullOutput()).toContain('sfo1 → Auto');
    });

    it('clears the failover regions with an empty string', async () => {
      let patchBody: unknown;
      useSettingsProject(
        { sandbox: { region: 'iad1', failoverRegions: ['sfo1', 'cle1'] } },
        body => {
          patchBody = body;
        }
      );

      client.setArgv(
        'project',
        'update',
        'my-project',
        '--sandbox-failover-regions',
        ''
      );

      const exitCodePromise = project(client);
      await confirmUpdatePrompt();
      await expect(exitCodePromise).resolves.toBe(0);

      expect(patchBody).toEqual({
        sandbox: { region: 'iad1', failoverRegions: [] },
      });
      expect(client.stderr.getFullOutput()).toContain('sfo1, cle1 → None');
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:update',
          value: 'update',
        },
        {
          key: 'argument:name',
          value: '[REDACTED]',
        },
        {
          key: 'option:sandbox-failover-regions',
          value: '[REDACTED]',
        },
      ]);
    });

    it('does not send a request when the values are unchanged', async () => {
      client.scenario.get('/v9/projects/:idOrName', (_req, res) => {
        res.json({
          ...defaultProject,
          id: 'prj_123',
          name: 'my-project',
          sandbox: { region: 'sfo1', failoverRegions: ['cle1'] },
        });
      });

      client.setArgv(
        'project',
        'update',
        'my-project',
        '--sandbox-region',
        'sfo1',
        '--sandbox-failover-regions',
        'cle1'
      );

      await expect(project(client)).resolves.toBe(0);

      expect(client.stderr.getFullOutput()).toContain(
        'Unchanged       Project Settings'
      );
    });

    it('treats a reordered failover list as a change', async () => {
      let patchBody: unknown;
      useSettingsProject(
        { sandbox: { region: 'iad1', failoverRegions: ['sfo1', 'cle1'] } },
        body => {
          patchBody = body;
        }
      );

      client.setArgv(
        'project',
        'update',
        'my-project',
        '--sandbox-failover-regions',
        'cle1,sfo1'
      );

      const exitCodePromise = project(client);
      await confirmUpdatePrompt();
      await expect(exitCodePromise).resolves.toBe(0);

      expect(patchBody).toEqual({
        sandbox: { region: 'iad1', failoverRegions: ['cle1', 'sfo1'] },
      });
    });

    it('normalizes casing, whitespace and duplicates', async () => {
      let patchBody: unknown;
      useSettingsProject({ sandbox: { region: 'iad1' } }, body => {
        patchBody = body;
      });

      client.setArgv(
        'project',
        'update',
        'my-project',
        '--sandbox-failover-regions',
        ' SFO1 , cle1 ,sfo1'
      );

      const exitCodePromise = project(client);
      await confirmUpdatePrompt();
      await expect(exitCodePromise).resolves.toBe(0);

      expect(patchBody).toEqual({
        sandbox: { region: 'iad1', failoverRegions: ['sfo1', 'cle1'] },
      });
    });

    it('rejects failover regions when no primary region is set', async () => {
      let patchBody: unknown;
      useSettingsProject({}, body => {
        patchBody = body;
      });

      client.setArgv(
        'project',
        'update',
        'my-project',
        '--sandbox-failover-regions',
        'cle1,iad1'
      );

      await expect(project(client)).resolves.toBe(1);

      expect(patchBody).toBeUndefined();
      expect(client.stderr.getFullOutput()).toContain(
        'Sandbox region is required when failover regions are specified.'
      );
    });

    it('accepts failover regions alongside a new primary region', async () => {
      let patchBody: unknown;
      useSettingsProject({}, body => {
        patchBody = body;
      });

      client.setArgv(
        'project',
        'update',
        'my-project',
        '--sandbox-region',
        'sfo1',
        '--sandbox-failover-regions',
        'cle1,iad1'
      );

      const exitCodePromise = project(client);
      await confirmUpdatePrompt();
      await expect(exitCodePromise).resolves.toBe(0);

      expect(patchBody).toEqual({
        sandbox: { region: 'sfo1', failoverRegions: ['cle1', 'iad1'] },
      });
      expect(client.stderr.getFullOutput()).toContain('None → cle1, iad1');
    });

    it('rejects failover regions that include the primary region', async () => {
      useSettingsProject({ sandbox: { region: 'iad1' } });

      client.setArgv(
        'project',
        'update',
        'my-project',
        '--sandbox-failover-regions',
        'iad1,sfo1'
      );

      await expect(project(client)).resolves.toBe(1);

      expect(client.stderr.getFullOutput()).toContain(
        'Sandbox failover regions must not include the primary region.'
      );
    });
  });

  describe('--non-interactive', () => {
    it('returns structured JSON when no setting option is provided', async () => {
      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);
      client.nonInteractive = true;
      client.setArgv('project', 'update', 'my-project', '--non-interactive');

      await expect(project(client)).rejects.toThrow('exit:2');

      expect(JSON.parse(client.stdout.getFullOutput().trim())).toMatchObject({
        status: 'error',
        reason: 'missing_arguments',
      });
      expect(client.stderr.getFullOutput()).toBe('');
    });
  });

  it('surfaces an API error after confirming the update', async () => {
    client.scenario.get('/v9/projects/my-project', (_req, res) => {
      res.json({
        ...defaultProject,
        id: 'prj_123',
        name: 'my-project',
        framework: 'nextjs',
      });
    });
    client.scenario.patch('/v9/projects/prj_123', (_req, res) => {
      res.status(403).json({
        error: {
          code: 'forbidden',
          message: 'You do not have permission to update this project.',
        },
      });
    });
    client.setArgv('project', 'update', 'my-project', '--framework', 'vite');
    const exitCodePromise = project(client);
    await confirmUpdatePrompt();

    await expect(exitCodePromise).resolves.toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'You do not have permission to update this project.'
    );
  });

  describe('compute and functions flags', () => {
    it.each<[string, string, Record<string, unknown>]>([
      ['--fluid-compute', 'on', { resourceConfig: { fluid: true } }],
      [
        '--elastic-concurrency',
        'off',
        { resourceConfig: { elasticConcurrencyEnabled: false } },
      ],
      [
        '--function-cpu',
        'performance',
        { resourceConfig: { functionDefaultMemoryType: 'performance' } },
      ],
      [
        '--build-machine',
        'enhanced',
        { resourceConfig: { buildMachineType: 'enhanced' } },
      ],
      ['--sandbox-region', 'cle1', { sandbox: { region: 'cle1' } }],
      ['--node-version', '20.x', { nodeVersion: '20.x' }],
    ])('sends a sparse PATCH for %s %s', async (flag, value, expectedBody) => {
      let patched = false;
      useScope('pro');
      useSettingsProject({}, body => {
        patched = true;
        expect(body).toEqual(expectedBody);
      });

      client.setArgv('project', 'update', 'my-project', flag, value);
      const exitCodePromise = project(client);
      await confirmUpdatePrompt();

      await expect(exitCodePromise).resolves.toBe(0);
      expect(patched).toBe(true);
    });

    it('omits existing resourceConfig siblings when changing one field', async () => {
      let patched = false;
      useScope('pro');
      useSettingsProject(
        {
          resourceConfig: {
            fluid: true,
            functionDefaultMemoryType: 'performance',
            buildMachineType: 'standard',
            buildMachineSelection: 'fixed',
            buildQueue: { configuration: 'WAIT_FOR_NAMESPACE_QUEUE' },
            functionDefaultRegions: ['iad1'],
            functionDefaultTimeout: 60,
            functionZeroConfigFailover: true,
          },
        } as Partial<Project>,
        body => {
          patched = true;
          expect(body).toEqual({
            resourceConfig: { buildMachineType: 'turbo' },
          });
        }
      );

      client.setArgv(
        'project',
        'update',
        'my-project',
        '--build-machine',
        'turbo'
      );
      const exitCodePromise = project(client);
      await confirmUpdatePrompt();

      await expect(exitCodePromise).resolves.toBe(0);
      expect(patched).toBe(true);
    });

    it('does not resend an incompatible CPU when enabling Fluid compute', async () => {
      useSettingsProject(
        {
          resourceConfig: {
            fluid: false,
            functionDefaultMemoryType: 'standard_legacy',
          },
        } as Partial<Project>,
        body => {
          expect(body).toEqual({ resourceConfig: { fluid: true } });
        }
      );

      client.setArgv(
        'project',
        'update',
        'my-project',
        '--fluid-compute',
        'on'
      );
      const exitCodePromise = project(client);
      await confirmUpdatePrompt();

      await expect(exitCodePromise).resolves.toBe(0);
    });

    it('rebases nested settings changed while confirmation is open', async () => {
      let patchBody: unknown;
      useSettingsProject(
        {
          resourceConfig: {
            fluid: false,
            functionDefaultTimeout: 30,
          },
        } as Partial<Project>,
        body => {
          patchBody = body;
        },
        undefined,
        (currentProject, requestCount) => {
          if (requestCount === 2) {
            (
              currentProject as Project & {
                resourceConfig: Record<string, unknown>;
              }
            ).resourceConfig.functionDefaultTimeout = 60;
          }
        }
      );

      client.setArgv(
        'project',
        'update',
        'my-project',
        '--fluid-compute',
        'on',
        '--yes'
      );

      await expect(project(client)).resolves.toBe(0);
      expect(patchBody).toEqual({ resourceConfig: { fluid: true } });
    });

    it('switches an elastic build machine to a fixed type', async () => {
      useScope('pro');
      useSettingsProject(
        {
          resourceConfig: {
            buildMachineType: 'standard',
            buildMachineSelection: 'elastic',
          },
        } as Partial<Project>,
        body => {
          expect(body).toEqual({
            resourceConfig: { buildMachineType: 'standard' },
          });
        },
        currentProject => {
          (
            currentProject as Project & {
              resourceConfig: Record<string, unknown>;
            }
          ).resourceConfig.buildMachineSelection = 'fixed';
        }
      );

      client.setArgv(
        'project',
        'update',
        'my-project',
        '--build-machine',
        'standard',
        '--json'
      );
      const exitCodePromise = project(client);
      await confirmUpdatePrompt();

      await expect(exitCodePromise).resolves.toBe(0);
      expect(JSON.parse(client.stdout.getFullOutput().trim())).toMatchObject({
        changed: true,
        settings: { buildMachineType: 'standard' },
      });
    });

    it('reports an elastic build machine from the update API', async () => {
      useScope('pro');
      useSettingsProject(
        {
          resourceConfig: {
            buildMachineType: 'standard',
            buildMachineSelection: 'fixed',
          },
        } as Partial<Project>,
        undefined,
        currentProject => {
          (
            currentProject as Project & {
              resourceConfig: Record<string, unknown>;
            }
          ).resourceConfig.buildMachineSelection = 'elastic';
        }
      );

      client.setArgv(
        'project',
        'update',
        'my-project',
        '--build-machine',
        'elastic',
        '--json'
      );
      const exitCodePromise = project(client);
      await confirmUpdatePrompt();

      await expect(exitCodePromise).resolves.toBe(0);
      expect(JSON.parse(client.stdout.getFullOutput().trim()).settings).toEqual(
        {
          buildMachineType: 'elastic',
        }
      );
    });

    it('reports the settings returned by the update API', async () => {
      useSettingsProject({ nodeVersion: '18.x' }, undefined, currentProject => {
        currentProject.nodeVersion = '22.x';
      });

      client.setArgv(
        'project',
        'update',
        'my-project',
        '--node-version',
        '20.x',
        '--json'
      );
      const exitCodePromise = project(client);
      await confirmUpdatePrompt();

      await expect(exitCodePromise).resolves.toBe(0);
      expect(JSON.parse(client.stdout.getFullOutput().trim()).settings).toEqual(
        {
          nodeVersion: '22.x',
        }
      );
    });

    it.each([
      ['--fluid-compute', 'yes', '--fluid-compute must be "on" or "off".'],
      ['--function-cpu', 'mega', 'Function CPU must be one of'],
      ['--build-machine', 'huge', 'Build Machine must be one of'],
      ['--node-version', '19.x', 'Node.js Version must be one of'],
    ])('rejects an invalid %s value before resolving a project', async (flag, value, message) => {
      client.setArgv('project', 'update', 'my-project', flag, value);

      await expect(project(client)).resolves.toBe(1);
      expect(client.stderr.getFullOutput()).toContain(message);
      expect(client.stdout.getFullOutput()).toBe('');
    });

    it('combines multiple flags into one sparse PATCH and reports JSON', async () => {
      useScope('pro');
      useSettingsProject({ framework: 'vite' }, body => {
        expect(body).toEqual({
          framework: 'nextjs',
          resourceConfig: {
            fluid: true,
            functionDefaultMemoryType: 'performance_xl',
          },
          nodeVersion: '22.x',
        });
      });

      client.setArgv(
        'project',
        'update',
        'my-project',
        '--framework',
        'nextjs',
        '--fluid-compute',
        'on',
        '--function-cpu',
        'performance_xl',
        '--node-version',
        '22.x',
        '--json'
      );
      const exitCodePromise = project(client);
      await confirmUpdatePrompt();

      await expect(exitCodePromise).resolves.toBe(0);
      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload.changed).toBe(true);
      expect(payload.changedSettings).toEqual(
        expect.arrayContaining(['framework', 'fluid', 'nodeVersion'])
      );
      expect(payload.settings).toMatchObject({
        framework: 'nextjs',
        fluid: true,
        functionDefaultMemoryType: 'performance_xl',
        nodeVersion: '22.x',
      });
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:update', value: 'update' },
        { key: 'argument:name', value: '[REDACTED]' },
        { key: 'option:framework', value: '[REDACTED]' },
        { key: 'flag:json', value: 'TRUE' },
        { key: 'option:fluid-compute', value: 'on' },
        { key: 'option:function-cpu', value: 'performance_xl' },
        { key: 'option:node-version', value: '22.x' },
      ]);
    });

    it('does not send a PATCH when the value is unchanged', async () => {
      useSettingsProject({ nodeVersion: '20.x' });
      const fetchSpy = vi.spyOn(client, 'fetch');

      client.setArgv(
        'project',
        'update',
        'my-project',
        '--node-version',
        '20.x',
        '--json'
      );

      await expect(project(client)).resolves.toBe(0);
      expect(
        fetchSpy.mock.calls.find(([, options]) => options?.method === 'PATCH')
      ).toBeUndefined();
      expect(JSON.parse(client.stdout.getFullOutput().trim())).toEqual({
        changed: false,
        changedSettings: [],
        projectId: 'prj_123',
        projectName: 'my-project',
        settings: { nodeVersion: '20.x' },
      });
    });
  });

  describe('plan gating', () => {
    it.each<[string, string, string]>([
      ['--build-machine', 'basic', 'Build Machine "basic"'],
      ['--build-machine', 'standard', 'Build Machine "standard"'],
      ['--build-machine', 'turbo', 'Build Machine "turbo"'],
      ['--function-cpu', 'performance', 'Function CPU "performance"'],
      ['--elastic-concurrency', 'on', 'Elastic Concurrency "on"'],
    ])('refuses %s %s on a Hobby team without sending a PATCH', async (flag, value, phrase) => {
      useScope('hobby');
      useSettingsProject({});
      const fetchSpy = vi.spyOn(client, 'fetch');

      client.setArgv('project', 'update', 'my-project', flag, value);

      await expect(project(client)).resolves.toBe(1);
      expect(
        fetchSpy.mock.calls.find(([, options]) => options?.method === 'PATCH')
      ).toBeUndefined();
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain(phrase);
      expect(stderr).toContain('Pro or Enterprise plan');
      expect(stderr).toContain('buy pro');
      expect(client.stdout.getFullOutput()).toBe('');
    });

    it('refuses a gated setting when there is no team', async () => {
      useUser();
      useSettingsProject({});
      const fetchSpy = vi.spyOn(client, 'fetch');

      client.setArgv(
        'project',
        'update',
        'my-project',
        '--build-machine',
        'elastic'
      );

      await expect(project(client)).resolves.toBe(1);
      expect(
        fetchSpy.mock.calls.find(([, options]) => options?.method === 'PATCH')
      ).toBeUndefined();
      expect(client.stderr.getFullOutput()).toContain('Pro or Enterprise plan');
    });

    it('lists every gated setting in one message', async () => {
      useScope('hobby');
      useSettingsProject({});

      client.setArgv(
        'project',
        'update',
        'my-project',
        '--build-machine',
        'turbo',
        '--function-cpu',
        'performance'
      );

      await expect(project(client)).resolves.toBe(1);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('Build Machine "turbo"');
      expect(stderr).toContain('Function CPU "performance"');
      expect(stderr).toContain('require a Pro or Enterprise plan');
    });

    it('emits a structured plan upgrade error in non-interactive mode', async () => {
      useScope('hobby');
      useSettingsProject({});
      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);
      client.nonInteractive = true;

      client.setArgv(
        'project',
        'update',
        'my-project',
        '--build-machine',
        'turbo',
        '--non-interactive'
      );

      await expect(project(client)).rejects.toThrow('exit:1');
      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'plan_upgrade_required',
        userActionRequired: true,
      });
      expect(
        payload.next.some((next: { command: string }) =>
          /buy pro/.test(next.command)
        )
      ).toBe(true);
      expect(payload.next[0].command).not.toContain('--non-interactive');
    });

    it('does not require a plan lookup when a paid setting is unchanged', async () => {
      useScope('hobby');
      useSettingsProject({
        resourceConfig: { buildMachineType: 'turbo' },
      } as Partial<Project>);
      const fetchSpy = vi.spyOn(client, 'fetch');

      client.setArgv(
        'project',
        'update',
        'my-project',
        '--build-machine',
        'turbo',
        '--json'
      );

      await expect(project(client)).resolves.toBe(0);
      expect(JSON.parse(client.stdout.getFullOutput().trim()).changed).toBe(
        false
      );
      expect(
        fetchSpy.mock.calls.find(([, options]) => options?.method === 'PATCH')
      ).toBeUndefined();
    });

    it('treats unknown plans conservatively', async () => {
      useScope('oss');
      useSettingsProject({});

      client.setArgv(
        'project',
        'update',
        'my-project',
        '--build-machine',
        'turbo'
      );

      await expect(project(client)).resolves.toBe(1);
      expect(client.stderr.getFullOutput()).toContain('Pro or Enterprise plan');
    });

    it('allows paid settings on Enterprise teams', async () => {
      useScope('enterprise');
      useSettingsProject({});

      client.setArgv(
        'project',
        'update',
        'my-project',
        '--build-machine',
        'turbo'
      );
      const exitCodePromise = project(client);
      await confirmUpdatePrompt();

      await expect(exitCodePromise).resolves.toBe(0);
    });

    it('allows paid settings on paid personal accounts', async () => {
      client.config.currentTeam = undefined;
      useUser({ billing: billing('pro') });
      useSettingsProject({});

      client.setArgv(
        'project',
        'update',
        'my-project',
        '--function-cpu',
        'performance'
      );
      const exitCodePromise = project(client);
      await confirmUpdatePrompt();

      await expect(exitCodePromise).resolves.toBe(0);
    });

    it('checks the resolved project owner instead of a different selected team', async () => {
      useScope('hobby');
      useSettingsProject({ accountId: 'team_project' });
      client.scenario.get('/teams/team_project', (_req, res) => {
        res.json({
          id: 'team_project',
          slug: 'project-team',
          name: 'Project Team',
          billing: { plan: 'pro' },
        });
      });

      client.setArgv(
        'project',
        'update',
        'my-project',
        '--build-machine',
        'turbo'
      );
      const exitCodePromise = project(client);
      await confirmUpdatePrompt();

      await expect(exitCodePromise).resolves.toBe(0);
    });

    it.each<[string, string, Record<string, unknown>]>([
      [
        '--elastic-concurrency',
        'off',
        { resourceConfig: { elasticConcurrencyEnabled: false } },
      ],
      ['--fluid-compute', 'on', { resourceConfig: { fluid: true } }],
      ['--node-version', '20.x', { nodeVersion: '20.x' }],
    ])('allows ungated %s %s on a Hobby team', async (flag, value, expectedBody) => {
      let patched = false;
      useScope('hobby');
      useSettingsProject({}, body => {
        patched = true;
        expect(body).toEqual(expectedBody);
      });

      client.setArgv('project', 'update', 'my-project', flag, value);
      const exitCodePromise = project(client);
      await confirmUpdatePrompt();

      await expect(exitCodePromise).resolves.toBe(0);
      expect(patched).toBe(true);
    });
  });

  describe('confirmation', () => {
    it('previews changes and applies after confirming', async () => {
      const currentProject = useSettingsProject({ framework: 'nextjs' });

      client.setArgv('project', 'update', 'my-project', '--framework', 'vite');
      const exitCodePromise = project(client);

      await expect(client.stderr).toOutput('Update 1 setting for my-project?');
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('Project         my-project');
      expect(stderr).toContain('Next.js (nextjs) → Vite (vite)');
      client.stdin.write('y\n');

      await expect(exitCodePromise).resolves.toBe(0);
      expect(currentProject.framework).toBe('vite');
      await expect(client.stderr).toOutput('Updated         Project Settings');
    });

    it('confirms multiple changes with one prompt', async () => {
      useScope('pro');
      useSettingsProject({ framework: 'nextjs' });

      client.setArgv(
        'project',
        'update',
        'my-project',
        '--framework',
        'vite',
        '--node-version',
        '22.x'
      );
      const exitCodePromise = project(client);

      await expect(client.stderr).toOutput('Update 2 settings for my-project?');
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('Next.js (nextjs) → Vite (vite)');
      expect(stderr).toContain('Auto → 22.x');
      client.stdin.write('y\n');

      await expect(exitCodePromise).resolves.toBe(0);
    });

    it('cancels without a PATCH when declined', async () => {
      useSettingsProject({ framework: 'nextjs' });
      const fetchSpy = vi.spyOn(client, 'fetch');

      client.setArgv('project', 'update', 'my-project', '--framework', 'vite');
      const exitCodePromise = project(client);

      await expect(client.stderr).toOutput('Update 1 setting for my-project?');
      client.stdin.write('n\n');

      await expect(exitCodePromise).resolves.toBe(0);
      expect(
        fetchSpy.mock.calls.find(([, options]) => options?.method === 'PATCH')
      ).toBeUndefined();
      await expect(client.stderr).toOutput('Canceled');
    });

    it('emits action_required in non-interactive mode', async () => {
      useSettingsProject({ buildCommand: 'pnpm build' });
      const fetchSpy = vi.spyOn(client, 'fetch');
      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);
      client.nonInteractive = true;

      client.setArgv(
        'project',
        'update',
        'my-project',
        '--build-command',
        'pnpm build && echo unsafe',
        '--token',
        'secret-token',
        '--non-interactive'
      );

      await expect(project(client)).rejects.toThrow('exit:1');
      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload).toMatchObject({
        status: 'action_required',
        reason: 'confirmation_required',
        action: 'confirmation_required',
        userActionRequired: false,
      });
      expect(payload.next[0].command).toBe(
        "vercel project update my-project --build-command 'pnpm build && echo unsafe' --non-interactive --yes"
      );
      expect(payload.next[0].command).not.toContain('secret-token');
      expect(
        fetchSpy.mock.calls.find(([, options]) => options?.method === 'PATCH')
      ).toBeUndefined();
    });

    it('applies a lower-risk update with --yes in a TTY', async () => {
      const currentProject = useSettingsProject({ framework: 'nextjs' });

      client.setArgv(
        'project',
        'update',
        'my-project',
        '--framework',
        'vite',
        '--yes'
      );

      await expect(project(client)).resolves.toBe(0);
      expect(currentProject.framework).toBe('vite');
      expect(client.stderr.getFullOutput()).not.toContain(
        'Update 1 setting for my-project?'
      );
    });

    it('applies a lower-risk update with --yes when stdin is not a TTY', async () => {
      const currentProject = useSettingsProject({ framework: 'nextjs' });
      client.stdin.isTTY = false;

      client.setArgv(
        'project',
        'update',
        'my-project',
        '--framework',
        'vite',
        '--yes'
      );

      await expect(project(client)).resolves.toBe(0);
      expect(currentProject.framework).toBe('vite');
    });

    it('returns structured success for a non-interactive --yes update', async () => {
      useSettingsProject({ framework: 'nextjs' });
      client.nonInteractive = true;

      client.setArgv(
        'project',
        'update',
        'my-project',
        '--framework',
        'vite',
        '--non-interactive',
        '--yes'
      );

      await expect(project(client)).resolves.toBe(0);
      expect(JSON.parse(client.stdout.getFullOutput().trim())).toMatchObject({
        changed: true,
        changedSettings: ['framework'],
        settings: { framework: 'vite' },
      });
      expect(client.stderr.getFullOutput()).toBe('');
    });

    it('does not let --yes bypass a charge-sensitive TTY confirmation', async () => {
      useScope('pro');
      useSettingsProject({});

      client.setArgv(
        'project',
        'update',
        'my-project',
        '--build-machine',
        'turbo',
        '--yes'
      );
      const exitCodePromise = project(client);

      await expect(client.stderr).toOutput('Update 1 setting for my-project?');
      expect(client.stderr.getFullOutput()).toContain(
        'Charges         These settings may affect your Vercel charges.'
      );
      client.stdin.write('y\n');

      await expect(exitCodePromise).resolves.toBe(0);
    });

    it('requires a human for charge-sensitive non-interactive updates even with --yes', async () => {
      useScope('pro');
      useSettingsProject({});
      const fetchSpy = vi.spyOn(client, 'fetch');
      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);
      client.nonInteractive = true;

      client.setArgv(
        'project',
        'update',
        'my-project',
        '--build-machine',
        'turbo',
        '--non-interactive',
        '--yes'
      );

      await expect(project(client)).rejects.toThrow('exit:1');
      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload).toMatchObject({
        status: 'action_required',
        reason: 'interactive_confirmation_required',
        userActionRequired: true,
      });
      expect(payload.next[0].command).toBe(
        'vercel project update my-project --build-machine turbo'
      );
      expect(
        fetchSpy.mock.calls.find(([, options]) => options?.method === 'PATCH')
      ).toBeUndefined();
    });

    it('fails when stdin is not a TTY', async () => {
      useSettingsProject({ framework: 'nextjs' });
      const fetchSpy = vi.spyOn(client, 'fetch');
      client.stdin.isTTY = false;

      client.setArgv('project', 'update', 'my-project', '--framework', 'vite');

      await expect(project(client)).resolves.toBe(1);
      expect(client.stderr.getFullOutput()).toContain('Confirmation required');
      expect(
        fetchSpy.mock.calls.find(([, options]) => options?.method === 'PATCH')
      ).toBeUndefined();
    });

    it('does not let --yes bypass charge-sensitive updates without a TTY', async () => {
      useScope('pro');
      useSettingsProject({});
      const fetchSpy = vi.spyOn(client, 'fetch');
      client.stdin.isTTY = false;

      client.setArgv(
        'project',
        'update',
        'my-project',
        '--function-cpu',
        'performance',
        '--yes'
      );

      await expect(project(client)).resolves.toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        'must be confirmed in an interactive terminal'
      );
      expect(
        fetchSpy.mock.calls.find(([, options]) => options?.method === 'PATCH')
      ).toBeUndefined();
    });

    it('skips the prompt when nothing changed', async () => {
      useSettingsProject({ framework: 'vite' });
      const fetchSpy = vi.spyOn(client, 'fetch');

      client.setArgv('project', 'update', 'my-project', '--framework', 'vite');

      await expect(project(client)).resolves.toBe(0);
      expect(
        fetchSpy.mock.calls.find(([, options]) => options?.method === 'PATCH')
      ).toBeUndefined();
      expect(client.stderr.getFullOutput()).toContain('Unchanged');
    });
  });
});
