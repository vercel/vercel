import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveSandboxTarget } from '../../../../src/util/sandbox/target';
import * as getScopeModule from '../../../../src/util/get-scope';
import * as linkModule from '../../../../src/util/projects/link';

vi.mock('../../../../src/util/get-scope');
vi.mock('../../../../src/util/projects/link');

function fakeClient(token?: string) {
  return { authConfig: { token }, config: {} } as never;
}

describe('resolveSandboxTarget', () => {
  afterEach(() => {
    delete process.env.VERCEL_AUTH_TOKEN;
    vi.clearAllMocks();
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

  it('falls back to getScope/getLinkedProject when opts are omitted', async () => {
    vi.mocked(getScopeModule.default).mockResolvedValue({
      contextName: 'my-team',
      team: { id: 'team_x', slug: 'my-team' } as never,
      user: { id: 'user_x' } as never,
    });
    vi.mocked(linkModule.getLinkedProject).mockResolvedValue({
      status: 'linked',
      project: {
        id: 'proj_x',
        name: 'proj-x',
        accountId: 'team_x',
        updatedAt: 0,
        createdAt: 0,
      } as never,
      org: { id: 'team_x', slug: 'my-team', type: 'team' },
    });

    const t = await resolveSandboxTarget(fakeClient('tok'));

    expect(t).toEqual({ token: 'tok', teamId: 'team_x', projectId: 'proj_x' });
  });

  it('throws a friendly scope error when neither team nor project can be resolved', async () => {
    vi.mocked(getScopeModule.default).mockResolvedValue({
      contextName: 'someone',
      team: null,
      user: { id: 'user_x' } as never,
    });
    vi.mocked(linkModule.getLinkedProject).mockResolvedValue({
      status: 'not_linked',
      org: null,
      project: null,
    });

    await expect(resolveSandboxTarget(fakeClient('tok'))).rejects.toThrow(
      /--scope.*--project.*vercel link/i
    );
  });
});
