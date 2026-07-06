import { join } from 'path';
import { outputFile } from 'fs-extra';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '@vercel-internals/types';
import project from '../../../../src/commands/project';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeam } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

function useSettingsProject(
  settings: Partial<Project>,
  onPatch?: (body: unknown) => void
) {
  const currentProject: Project = {
    ...defaultProject,
    id: 'prj_123',
    name: 'my-project',
    ...settings,
  };

  client.scenario.get('/v9/projects/:idOrName', (req, res) => {
    if (
      req.params.idOrName !== currentProject.id &&
      req.params.idOrName !== currentProject.name
    ) {
      return res.status(404).send();
    }
    res.json(currentProject);
  });
  client.scenario.patch('/v9/projects/prj_123', (req, res) => {
    onPatch?.(req.body);
    Object.assign(currentProject, req.body);
    res.json(currentProject);
  });

  return currentProject;
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
      expect(helpOutput).toContain('--format');
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
    const exitCode = await project(client);

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
    const exitCode = await project(client);

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
      '--format',
      'json'
    );
    const exitCode = await project(client);

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
    expect(client.stderr.getFullOutput()).toBe('');
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
        key: 'option:format',
        value: 'json',
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
    const exitCode = await project(client);

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
    const exitCode = await project(client);

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
    const exitCode = await project(client);

    expect(exitCode).toBe(0);
    expect(currentProject.framework).toBeNull();
    expect(client.stderr.getFullOutput()).toContain('Other (other)');
  });

  it('accepts framework slugs case-insensitively', async () => {
    const currentProject = useSettingsProject({ framework: 'vite' }, body => {
      expect(body).toEqual({ framework: 'nextjs' });
    });

    client.setArgv('project', 'update', 'my-project', '--framework', 'NextJS');
    const exitCode = await project(client);

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
      '--format',
      'json'
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
    const exitCode = await project(client);

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

    it('returns structured JSON when the API denies the update', async () => {
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
      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);
      client.nonInteractive = true;
      client.setArgv(
        'project',
        'update',
        'my-project',
        '--framework',
        'vite',
        '--non-interactive'
      );

      await expect(project(client)).rejects.toThrow('exit:1');

      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'forbidden',
        message: 'You do not have permission to update this project.',
      });
      expect(
        payload.next.some((next: { command: string }) =>
          /project update/.test(next.command)
        )
      ).toBe(true);
      expect(client.stderr.getFullOutput()).toBe('');
    });
  });
});
