import { describe, it, expect } from 'vitest';
import { useUser } from '../../../mocks/user';
import microfrontends from '../../../../src/commands/microfrontends';
import { client } from '../../../mocks/client';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import {
  useMicrofrontendsDeploymentNotFound,
  useMicrofrontendsForDeployment,
  useMicrofrontendsForProject,
  useMicrofrontendsNotEnabled,
} from '../../../mocks/microfrontends';

describe('microfrontends pull', () => {
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
