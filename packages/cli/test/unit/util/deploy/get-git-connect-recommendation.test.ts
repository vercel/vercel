import { describe, expect, it, vi } from 'vitest';
import { getGitConnectRecommendation } from '../../../../src/util/deploy/get-git-connect-recommendation';

function fakeClient(cwd = '/repo') {
  return {
    argv: ['node', 'vercel'],
    cwd,
    config: {},
  } as any;
}

function deps(
  options: { linked?: boolean; remote?: string; remotes?: string[] } = {}
) {
  const remotes = options.remotes ?? [
    options.remote ?? 'git@github.com:acme/web.git',
  ];
  return {
    getGitConfigPath: vi.fn(() => '/repo/.git/config'),
    parseGitConfig: vi.fn(async () =>
      Object.fromEntries(
        remotes.map((url, index) => [
          `remote "${index === 0 ? 'origin' : `remote${index}`}"`,
          { url },
        ])
      )
    ),
    fetchProject: vi.fn(async () => ({
      id: 'prj_1',
      name: 'web',
      accountId: 'team_1',
      link: options.linked ? { type: 'github' } : null,
    })),
    buildCommand: vi.fn((_client, command) => `vercel ${command}`),
  } as any;
}

describe('getGitConnectRecommendation()', () => {
  const project = {
    id: 'prj_1',
    name: 'web',
    accountId: 'team_1',
  } as any;

  it('recommends connecting a supported remote to an unlinked project', async () => {
    await expect(
      getGitConnectRecommendation(fakeClient(), '/repo', project, {
        deps: deps(),
      })
    ).resolves.toBe('vercel git connect');
  });

  it('stays silent when the project is already linked', async () => {
    await expect(
      getGitConnectRecommendation(fakeClient(), '/repo', project, {
        deps: deps({ linked: true }),
      })
    ).resolves.toBeUndefined();
  });

  it('stays silent for unsupported remotes', async () => {
    const recommendationDeps = deps({
      remote: 'https://git.example.com/acme/web.git',
    });
    await expect(
      getGitConnectRecommendation(fakeClient(), '/repo', project, {
        deps: recommendationDeps,
      })
    ).resolves.toBeUndefined();
    expect(recommendationDeps.fetchProject).not.toHaveBeenCalled();
  });

  it('stays silent in non-interactive output when remote selection is ambiguous', async () => {
    const cli = fakeClient();
    cli.nonInteractive = true;
    await expect(
      getGitConnectRecommendation(cli, '/repo', project, {
        deps: deps({
          remotes: [
            'git@github.com:acme/web.git',
            'git@github.com:vercel/web.git',
          ],
        }),
      })
    ).resolves.toBeUndefined();
  });

  it('stays silent when Git was already offered during setup', async () => {
    const recommendationDeps = deps();
    await expect(
      getGitConnectRecommendation(fakeClient(), '/repo', project, {
        deps: recommendationDeps,
        alreadyOffered: true,
      })
    ).resolves.toBeUndefined();
    expect(recommendationDeps.fetchProject).not.toHaveBeenCalled();
  });

  it('preserves a positional deployment path with --cwd', async () => {
    const command = await getGitConnectRecommendation(
      fakeClient('/workspace'),
      '/workspace/apps/web app',
      project,
      { deps: deps() }
    );
    expect(command).toContain("git connect --cwd '/workspace/apps/web app'");
  });
});
