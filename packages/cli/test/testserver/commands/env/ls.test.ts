import { randomUUID } from 'node:crypto';
import { testserverTest as test, expect } from '../../fixtures/test';
import { linkDir, seedEnv } from './setup';

describe('env ls', () => {
  test('lists variables across environments', async ({
    login,
    cli,
    api,
    tmpDir,
  }) => {
    const { team, project } = await login({
      withProject: { name: `env-ls-${randomUUID().slice(0, 8)}` },
    });
    await seedEnv(api, project!.id, {
      key: 'PROD_ONLY',
      value: 'a',
      target: ['production'],
    });
    await seedEnv(api, project!.id, {
      key: 'PREVIEW_ONLY',
      value: 'b',
      target: ['preview'],
    });
    const cwd = tmpDir();
    linkDir(cwd, { projectId: project!.id, orgId: team.id });

    const r = await cli.run(['env', 'ls'], { cwd });
    expect(r.exitCode, r.stderr).toBe(0);
    expect(r.stdout).toContain('PROD_ONLY');
    expect(r.stdout).toContain('PREVIEW_ONLY');
  });

  test('filters by environment', async ({ login, cli, api, tmpDir }) => {
    const { team, project } = await login({
      withProject: { name: `env-ls-${randomUUID().slice(0, 8)}` },
    });
    await seedEnv(api, project!.id, {
      key: 'PROD_ONLY',
      value: 'a',
      target: ['production'],
    });
    await seedEnv(api, project!.id, {
      key: 'PREVIEW_ONLY',
      value: 'b',
      target: ['preview'],
    });
    const cwd = tmpDir();
    linkDir(cwd, { projectId: project!.id, orgId: team.id });

    const r = await cli.run(['env', 'ls', '--environment', 'production'], {
      cwd,
    });
    expect(r.exitCode, r.stderr).toBe(0);
    expect(r.stdout).toContain('PROD_ONLY');
    expect(r.stdout).not.toContain('PREVIEW_ONLY');
  });
});
