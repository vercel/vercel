import { randomUUID } from 'node:crypto';
import { testserverTest as test, expect } from '../../fixtures/test';

describe('project create', () => {
  // `project create` takes the name as an argument and doesn't prompt
  // (src/commands/project/add.ts), so no --yes is needed.
  test('creates the project on the server', async ({ login, cli, api }) => {
    const { team } = await login();
    const name = `created-${randomUUID().slice(0, 8)}`;
    const r = await cli.run(['project', 'create', name]);
    expect(r.exitCode, r.stderr).toBe(0);
    expect(r.stderr).toContain(name);

    const res = await api.raw(`/v9/projects/${name}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string; accountId: string };
    expect(body.name).toBe(name);
    expect(body.accountId).toBe(team.id);
  });
});
