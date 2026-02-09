import { describe, it, expect, vi } from 'vitest';
import { useUser } from '../../../mocks/user';
import microfrontends from '../../../../src/commands/microfrontends';
import { client } from '../../../mocks/client';
import {
  setupUnitFixture,
  setupTmpDir,
} from '../../../helpers/setup-unit-fixture';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams, createTeam } from '../../../mocks/team';
import {
  useMicrofrontendsDeploymentNotFound,
  useMicrofrontendsForDeployment,
  useMicrofrontendsForProject,
  useMicrofrontendsNotEnabled,
} from '../../../mocks/microfrontends';

describe('microfrontends pull', () => {
  describe('--non-interactive', () => {
    it('outputs action_required JSON and exits when not linked and multiple teams (no --scope)', async () => {
      const cwd = setupTmpDir();
      useUser({ version: 'northstar' });
      useTeams('team_dummy');
      createTeam();
      client.cwd = cwd;
      client.setArgv('microfrontends', 'pull', '--non-interactive');
      (client as { nonInteractive: boolean }).nonInteractive = true;

      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((code?: number) => {
          throw new Error(`process.exit(${code})`);
        });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await expect(microfrontends(client)).rejects.toThrow('process.exit(1)');

      expect(logSpy).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(logSpy.mock.calls[0][0]);
      expect(payload.status).toBe('action_required');
      expect(payload.reason).toBe('missing_scope');
      expect(payload.message).toContain('Multiple teams');
      expect(Array.isArray(payload.choices)).toBe(true);
      expect(payload.choices.length).toBeGreaterThanOrEqual(2);
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
      logSpy.mockRestore();
      (client as { nonInteractive: boolean }).nonInteractive = false;
    });
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'microfrontends';
      const subcommand = 'pull';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = microfrontends(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:${subcommand}`,
        },
      ]);
    });
  });

  it('should pull microfrontends configuration', async () => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-microfrontends-pull',
      name: 'vercel-microfrontends-pull',
    });
    useMicrofrontendsForProject();
    const cwd = setupUnitFixture('vercel-microfrontends-pull');

    client.cwd = cwd;
    client.setArgv('microfrontends', 'pull');
    const microfrontendsPromise = microfrontends(client);

    await expect(client.stderr).toOutput(
      `Fetching microfrontends configuration`
    );

    const exitCode = await microfrontendsPromise;
    expect(exitCode).toEqual(0);

    await expect(client.stderr).toOutput(
      `Downloaded microfrontends configuration to`
    );
  });

  it('should fail when project is not a microfrontends project', async () => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-microfrontends-pull',
      name: 'vercel-microfrontends-pull',
    });
    useMicrofrontendsNotEnabled();
    const cwd = setupUnitFixture('vercel-microfrontends-pull');

    client.cwd = cwd;
    client.setArgv('microfrontends', 'pull');
    const microfrontendsPromise = microfrontends(client);

    const exitCode = await microfrontendsPromise;
    expect(exitCode).toEqual(1);

    await expect(client.stderr).toOutput(
      `Project is not part of a microfrontends group`
    );
  });

  describe('--dpl', () => {
    it('should use the provided deployment ID', async () => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'vercel-microfrontends-pull',
        name: 'vercel-microfrontends-pull',
      });
      useMicrofrontendsForDeployment();
      const cwd = setupUnitFixture('vercel-microfrontends-pull');

      client.cwd = cwd;
      client.setArgv('microfrontends', 'pull', '--dpl=dpl_12345');
      const microfrontendsPromise = microfrontends(client);

      await expect(client.stderr).toOutput(
        `Fetching microfrontends configuration`
      );

      const exitCode = await microfrontendsPromise;
      expect(exitCode).toEqual(0);

      await expect(client.stderr).toOutput(
        `Downloaded microfrontends configuration to`
      );
    });

    it('should fail when the provided deployment ID does not exist', async () => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'vercel-microfrontends-pull',
        name: 'vercel-microfrontends-pull',
      });
      useMicrofrontendsDeploymentNotFound();
      const cwd = setupUnitFixture('vercel-microfrontends-pull');

      client.cwd = cwd;
      client.setArgv('microfrontends', 'pull', '--dpl=dpl_non_existent');
      const microfrontendsPromise = microfrontends(client);

      const exitCode = await microfrontendsPromise;
      expect(exitCode).toEqual(1);

      await expect(client.stderr).toOutput(`Deployment not found`);
    });
  });

  it('tracks argument', async () => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-microfrontends-pull',
      name: 'vercel-microfrontends-pull',
    });
    useMicrofrontendsForProject();
    const cwd = setupUnitFixture('vercel-microfrontends-pull');

    client.cwd = cwd;
    client.setArgv('microfrontends', 'pull');
    const microfrontendsPromise = microfrontends(client);

    const exitCode = await microfrontendsPromise;
    expect(exitCode).toEqual(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: `subcommand:pull`,
        value: 'pull',
      },
    ]);
  });
});
