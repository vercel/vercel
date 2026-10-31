import { testserverTest as test, expect } from '../../fixtures/test';

describe('whoami', () => {
  test('prints the logged-in username', async ({ login, cli }) => {
    const { user } = await login();
    const r = await cli.run(['whoami'], { scope: false });
    expect(r.exitCode, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe(user.username);
  });

  test('prints the username with --scope set to the team', async ({
    login,
    cli,
  }) => {
    const { user } = await login();
    const r = await cli.run(['whoami']);
    expect(r.exitCode, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe(user.username);
  });
});
