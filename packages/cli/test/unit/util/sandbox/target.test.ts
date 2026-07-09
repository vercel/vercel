import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveSandboxTarget } from '../../../../src/util/sandbox/target';
import * as getScopeModule from '../../../../src/util/get-scope';
import * as linkModule from '../../../../src/util/projects/link';
import * as getProjectByNameOrIdModule from '../../../../src/util/projects/get-project-by-id-or-name';

vi.mock('../../../../src/util/get-scope');
vi.mock('../../../../src/util/projects/link');
vi.mock('../../../../src/util/projects/get-project-by-id-or-name');

function fakeClient(token?: string) {
  return { authConfig: { token }, config: {} } as never;
}

describe('resolveSandboxTarget', () => {
  afterEach(() => {
    delete process.env.VERCEL_AUTH_TOKEN;
    vi.clearAllMocks();
  });

  it('resolves token/team from opts and project by id via getProjectByNameOrId', async () => {
    vi.mocked(getProjectByNameOrIdModule.default).mockResolvedValue({
      id: 'proj_1',
      name: 'proj-1',
      accountId: 'team_1',
    } as never);

    const t = await resolveSandboxTarget(fakeClient('tok'), {
      team: 'team_1',
      project: 'proj_1',
    });

    expect(t).toEqual({ token: 'tok', teamId: 'team_1', projectId: 'proj_1' });
    expect(getProjectByNameOrIdModule.default).toHaveBeenCalledWith(
      expect.anything(),
      'proj_1',
      'team_1'
    );
    expect(getScopeModule.default).not.toHaveBeenCalled();
  });

  it('resolves --project by name via getProjectByNameOrId within the resolved team', async () => {
    vi.mocked(getScopeModule.default).mockResolvedValue({
      contextName: 'my-team',
      team: { id: 'team_x', slug: 'my-team' } as never,
      user: { id: 'user_x' } as never,
    });
    vi.mocked(getProjectByNameOrIdModule.default).mockResolvedValue({
      id: 'proj_named',
      name: 'my-app',
      accountId: 'team_x',
    } as never);

    const t = await resolveSandboxTarget(fakeClient('tok'), {
      project: 'my-app',
    });

    expect(t).toEqual({
      token: 'tok',
      teamId: 'team_x',
      projectId: 'proj_named',
    });
    expect(getProjectByNameOrIdModule.default).toHaveBeenCalledWith(
      expect.anything(),
      'my-app',
      'team_x'
    );
  });

  it('prefers VERCEL_AUTH_TOKEN when the client has no token', async () => {
    process.env.VERCEL_AUTH_TOKEN = 'env-tok';
    vi.mocked(getProjectByNameOrIdModule.default).mockResolvedValue({
      id: 'proj_1',
      name: 'proj-1',
      accountId: 'team_1',
    } as never);

    const t = await resolveSandboxTarget(fakeClient(), {
      team: 'team_1',
      project: 'proj_1',
    });
    expect(t.token).toBe('env-tok');
  });

  it('prefers the client token over VERCEL_AUTH_TOKEN', async () => {
    process.env.VERCEL_AUTH_TOKEN = 'env-tok';
    vi.mocked(getProjectByNameOrIdModule.default).mockResolvedValue({
      id: 'proj_1',
      name: 'proj-1',
      accountId: 'team_1',
    } as never);

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

  it('names the honored token env vars (VERCEL_TOKEN, VERCEL_AUTH_TOKEN) in the not-authenticated message', async () => {
    await expect(
      resolveSandboxTarget(fakeClient(), {
        team: 'team_1',
        project: 'proj_1',
      })
    ).rejects.toThrow(/VERCEL_TOKEN/);
    await expect(
      resolveSandboxTarget(fakeClient(), {
        team: 'team_1',
        project: 'proj_1',
      })
    ).rejects.toThrow(/VERCEL_AUTH_TOKEN/);
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
    vi.mocked(linkModule.getLinkedProject).mockResolvedValue({
      status: 'not_linked',
      org: null,
      project: null,
    });

    await expect(resolveSandboxTarget(fakeClient('tok'))).rejects.toThrow(
      /--scope.*--project.*vercel link/i
    );
  });

  it('surfaces getLinkedProject status:"error" distinctly, propagating its exitCode', async () => {
    vi.mocked(linkModule.getLinkedProject).mockResolvedValue({
      status: 'error',
      exitCode: 7,
    });

    let caught: unknown;
    try {
      await resolveSandboxTarget(fakeClient('tok'));
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    const err = caught as Error & { exitCode?: number };
    expect(err.exitCode).toBe(7);
    expect(err.message).not.toMatch(/--scope.*--project.*vercel link/i);
  });

  it('throws when opts.team is given but the linked project belongs to a different team', async () => {
    vi.mocked(linkModule.getLinkedProject).mockResolvedValue({
      status: 'linked',
      project: {
        id: 'proj_x',
        name: 'proj-x',
        accountId: 'team_other',
        updatedAt: 0,
        createdAt: 0,
      } as never,
      org: { id: 'team_other', slug: 'other-team', type: 'team' },
    });

    await expect(
      resolveSandboxTarget(fakeClient('tok'), { team: 'team_1' })
    ).rejects.toThrow(/belongs to team "other-team"/i);
    expect(getScopeModule.default).not.toHaveBeenCalled();
  });

  it('resolves via the linked project when opts.team matches the linked project team', async () => {
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

    const t = await resolveSandboxTarget(fakeClient('tok'), {
      team: 'team_x',
    });

    expect(t).toEqual({ token: 'tok', teamId: 'team_x', projectId: 'proj_x' });
    expect(getScopeModule.default).not.toHaveBeenCalled();
  });
});
