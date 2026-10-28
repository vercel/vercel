import { randomUUID } from 'node:crypto';
import { testserverTest as test, expect } from '../../fixtures/test';
import { linkDir, listEnv, pulledEnv } from './setup';

describe('env add', () => {
  test('adds a config variable to one environment', async ({
    login,
    cli,
    api,
    tmpDir,
  }) => {
    const { team, project } = await login({
      withProject: { name: `env-add-${randomUUID().slice(0, 8)}` },
    });
    const cwd = tmpDir();
    linkDir(cwd, { projectId: project!.id, orgId: team.id });

    const r = await cli.run(
      [
        'env',
        'add',
        'GREETING',
        '--environment',
        'production',
        '--value',
        'hello',
        '--type',
        'config',
        '--yes',
      ],
      { cwd }
    );
    expect(r.exitCode, r.stderr).toBe(0);

    const envs = await listEnv(api, project!.id);
    expect(envs).toEqual([
      expect.objectContaining({
        key: 'GREETING',
        type: 'encrypted',
        target: ['production'],
      }),
    ]);
    expect(await pulledEnv(api, project!.id, 'production')).toMatchObject({
      GREETING: 'hello',
    });
  });

  test('stores a secret variable by default', async ({
    login,
    cli,
    api,
    tmpDir,
  }) => {
    const { team, project } = await login({
      withProject: { name: `env-add-${randomUUID().slice(0, 8)}` },
    });
    const cwd = tmpDir();
    linkDir(cwd, { projectId: project!.id, orgId: team.id });

    const r = await cli.run(
      [
        'env',
        'add',
        'API_KEY',
        '--environment',
        'production',
        '--value',
        'shh',
        '--yes',
      ],
      { cwd }
    );
    expect(r.exitCode, r.stderr).toBe(0);

    const envs = await listEnv(api, project!.id);
    expect(envs).toEqual([
      expect.objectContaining({
        key: 'API_KEY',
        type: 'sensitive',
        target: ['production'],
      }),
    ]);
  });
});
