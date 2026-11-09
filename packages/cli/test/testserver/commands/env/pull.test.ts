import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { testserverTest as test, expect } from '../../fixtures/test';
import { linkDir, seedEnv } from './setup';

describe('env pull', () => {
  test('writes the chosen environment to a file', async ({
    login,
    cli,
    api,
    tmpDir,
  }) => {
    const { team, project } = await login({
      withProject: { name: `env-pull-${randomUUID().slice(0, 8)}` },
    });
    await seedEnv(api, project!.id, {
      key: 'GREETING',
      value: 'hello',
      target: ['production'],
    });
    await seedEnv(api, project!.id, {
      key: 'PREVIEW_ONLY',
      value: 'b',
      target: ['preview'],
    });
    const cwd = tmpDir();
    linkDir(cwd, { projectId: project!.id, orgId: team.id });

    const r = await cli.run(
      ['env', 'pull', '.env.test', '--environment', 'production', '--yes'],
      { cwd }
    );
    expect(r.exitCode, r.stderr).toBe(0);

    const file = readFileSync(join(cwd, '.env.test'), 'utf8');
    expect(file).toContain('GREETING="hello"');
    expect(file).not.toContain('PREVIEW_ONLY');
  });
});
