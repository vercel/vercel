import { randomUUID } from 'node:crypto';
import { testserverTest as test, expect } from '../../fixtures/test';
import { linkDir, listEnv, seedEnv } from './setup';

describe('env rm', () => {
  test('removes the variable from the server', async ({
    login,
    cli,
    api,
    tmpDir,
  }) => {
    const { team, project } = await login({
      withProject: { name: `env-rm-${randomUUID().slice(0, 8)}` },
    });
    await seedEnv(api, project!.id, {
      key: 'GREETING',
      value: 'hello',
      target: ['production'],
    });
    const cwd = tmpDir();
    linkDir(cwd, { projectId: project!.id, orgId: team.id });

    const r = await cli.run(
      ['env', 'rm', 'GREETING', '--environment', 'production', '--yes'],
      { cwd }
    );
    expect(r.exitCode, r.stderr).toBe(0);
    expect(await listEnv(api, project!.id)).toEqual([]);
  });

  test('fails for a variable that does not exist', async ({
    login,
    cli,
    tmpDir,
  }) => {
    const { team, project } = await login({
      withProject: { name: `env-rm-${randomUUID().slice(0, 8)}` },
    });
    const cwd = tmpDir();
    linkDir(cwd, { projectId: project!.id, orgId: team.id });

    const r = await cli.run(
      ['env', 'rm', 'MISSING', '--environment', 'production', '--yes'],
      { cwd }
    );
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('Environment Variable was not found.');
  });
});
