import { afterEach, describe, expect, it } from 'vitest';
import { resolveSandboxTarget } from '../../../../src/util/sandbox/target';

function fakeClient(token?: string) {
  return { authConfig: { token }, config: {} } as never;
}

describe('resolveSandboxTarget', () => {
  afterEach(() => {
    delete process.env.VERCEL_AUTH_TOKEN;
  });

  it('resolves token/team/project from opts without a network call', async () => {
    const t = await resolveSandboxTarget(fakeClient('tok'), {
      team: 'team_1',
      project: 'proj_1',
    });
    expect(t).toEqual({ token: 'tok', teamId: 'team_1', projectId: 'proj_1' });
  });

  it('prefers VERCEL_AUTH_TOKEN when the client has no token', async () => {
    process.env.VERCEL_AUTH_TOKEN = 'env-tok';
    const t = await resolveSandboxTarget(fakeClient(), {
      team: 'team_1',
      project: 'proj_1',
    });
    expect(t.token).toBe('env-tok');
  });

  it('prefers the client token over VERCEL_AUTH_TOKEN', async () => {
    process.env.VERCEL_AUTH_TOKEN = 'env-tok';
    const t = await resolveSandboxTarget(fakeClient('client-tok'), {
      team: 'team_1',
      project: 'proj_1',
    });
    expect(t.token).toBe('client-tok');
  });

  it('throws when no token is available', async () => {
    await expect(
      resolveSandboxTarget(fakeClient(), {
        team: 'team_1',
        project: 'proj_1',
      })
    ).rejects.toThrow(/not authenticated|vercel login/i);
  });
});
