import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import deploy from '../../../../src/commands/deploy';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

describe('deploy --functions-beta', () => {
  it('should reject --functions-beta and --no-functions-beta together', async () => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      name: 'static',
      id: 'static',
      framework: 'fastapi',
    });

    client.cwd = setupUnitFixture('commands/deploy/static');
    client.setArgv('deploy', '--functions-beta', '--no-functions-beta');
    const exitCodePromise = deploy(client);
    await expect(client.stderr).toOutput(
      'Cannot use --functions-beta and --no-functions-beta together'
    );
    const exitCode = await exitCodePromise;
    expect(exitCode).toEqual(1);
  });

  it('should reject --functions-beta for non-Python frameworks', async () => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      name: 'static',
      id: 'static',
      framework: 'nextjs',
    });

    client.cwd = setupUnitFixture('commands/deploy/static');
    client.setArgv('deploy', '--functions-beta');
    const exitCodePromise = deploy(client);
    await expect(client.stderr).toOutput(
      'Extended function limits are only available for Python projects.'
    );
    const exitCode = await exitCodePromise;
    expect(exitCode).toEqual(1);
  });

  it('should enable functions beta for a Python project', async () => {
    const user = useUser();
    useTeams('team_dummy');

    let patchBody: unknown;
    client.scenario.patch('/v9/projects/static', (req, res) => {
      patchBody = req.body;
      res.json({
        ...defaultProject,
        id: 'static',
        name: 'static',
        framework: 'fastapi',
        ...req.body,
      });
    });
    useProject({
      ...defaultProject,
      name: 'static',
      id: 'static',
      framework: 'fastapi',
    });

    client.scenario.post('/v13/deployments', (_req, res) => {
      res.json({
        creator: { uid: user.id, username: user.username },
        id: 'dpl_test123',
        readyState: 'QUEUED',
      });
    });
    client.scenario.get('/v13/deployments/dpl_test123', (_req, res) => {
      res.json({
        creator: { uid: user.id, username: user.username },
        id: 'dpl_test123',
        readyState: 'READY',
        aliasAssigned: true,
        alias: [],
      });
    });

    client.cwd = setupUnitFixture('commands/deploy/static');
    client.setArgv('deploy', '--functions-beta', '--yes');
    const exitCodePromise = deploy(client);
    await expect(client.stderr).toOutput(
      'Extended function limits (Beta) enabled for this project.'
    );
    const exitCode = await exitCodePromise;
    expect(exitCode).toEqual(0);
    expect(patchBody).toEqual({
      resourceConfig: { enableFunctionsBeta: true },
    });
  });

  it('should disable functions beta with --no-functions-beta', async () => {
    const user = useUser();
    useTeams('team_dummy');

    let patchBody: unknown;
    client.scenario.patch('/v9/projects/static', (req, res) => {
      patchBody = req.body;
      res.json({
        ...defaultProject,
        id: 'static',
        name: 'static',
        framework: 'fastapi',
        ...req.body,
      });
    });
    useProject({
      ...defaultProject,
      name: 'static',
      id: 'static',
      framework: 'fastapi',
    });

    client.scenario.post('/v13/deployments', (_req, res) => {
      res.json({
        creator: { uid: user.id, username: user.username },
        id: 'dpl_test456',
        readyState: 'QUEUED',
      });
    });
    client.scenario.get('/v13/deployments/dpl_test456', (_req, res) => {
      res.json({
        creator: { uid: user.id, username: user.username },
        id: 'dpl_test456',
        readyState: 'READY',
        aliasAssigned: true,
        alias: [],
      });
    });

    client.cwd = setupUnitFixture('commands/deploy/static');
    client.setArgv('deploy', '--no-functions-beta', '--yes');
    const exitCodePromise = deploy(client);
    await expect(client.stderr).toOutput(
      'Extended function limits (Beta) disabled for this project.'
    );
    const exitCode = await exitCodePromise;
    expect(exitCode).toEqual(0);
    expect(patchBody).toEqual({
      resourceConfig: { enableFunctionsBeta: false },
    });
  });

  it('should warn when --functions-beta is used with no framework set', async () => {
    const user = useUser();
    useTeams('team_dummy');

    client.scenario.patch('/v9/projects/static', (req, res) => {
      res.json({
        ...defaultProject,
        id: 'static',
        name: 'static',
        ...req.body,
      });
    });
    useProject({
      ...defaultProject,
      name: 'static',
      id: 'static',
      // framework deliberately omitted
    });

    client.scenario.post('/v13/deployments', (_req, res) => {
      res.json({
        creator: { uid: user.id, username: user.username },
        id: 'dpl_test789',
        readyState: 'QUEUED',
      });
    });
    client.scenario.get('/v13/deployments/dpl_test789', (_req, res) => {
      res.json({
        creator: { uid: user.id, username: user.username },
        id: 'dpl_test789',
        readyState: 'READY',
        aliasAssigned: true,
        alias: [],
      });
    });

    client.cwd = setupUnitFixture('commands/deploy/static');
    client.setArgv('deploy', '--functions-beta', '--yes');
    const exitCodePromise = deploy(client);
    await expect(client.stderr).toOutput(
      'Project framework is not set. Extended function limits are designed for Python projects.'
    );
    const exitCode = await exitCodePromise;
    expect(exitCode).toEqual(0);
  });
});
