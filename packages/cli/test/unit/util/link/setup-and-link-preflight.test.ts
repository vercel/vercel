import { describe, expect, it, beforeEach, vi } from 'vitest';
import { resolveGitConnectIntent } from '../../../../src/util/link/setup-and-link';
import { client } from '../../../mocks/client';
import type { RepoLinkPreflight } from '../../../../src/util/git/repo-link-preflight';

vi.mock('../../../../src/util/create-git-meta', () => ({
  parseGitConfig: vi.fn(),
  pluckRemoteUrls: vi.fn(),
}));

vi.mock('../../../../src/util/link/repo', () => ({
  findRepoRoot: vi.fn(),
  linkRepoProject: vi.fn(),
}));

/**
 * The connect prompt's default is the whole subject here, so these go through
 * the real `client.fetch` against a mocked endpoint rather than stubbing the
 * preflight module — the wiring (URL, failure handling) is what can break.
 */
describe('resolveGitConnectIntent() prompt default', () => {
  let parseGitConfig: any;
  let pluckRemoteUrls: any;
  let findRepoRoot: any;

  /** Last `default` passed to the confirm prompt. */
  function confirmDefault(): boolean {
    const call = vi.mocked(client.input.confirm).mock.calls.at(-1);
    return call?.[1] as boolean;
  }

  function servePreflight(body: Partial<RepoLinkPreflight>, status = 200) {
    client.scenario.get('/v1/integrations/repo-link-preflight', (req, res) => {
      res.status(status).json({
        provider: 'github',
        repo: 'user/repo',
        canLink: false,
        ...body,
        _query: req.query,
      });
    });
  }

  beforeEach(async () => {
    vi.clearAllMocks();

    const gitMeta = await import('../../../../src/util/create-git-meta');
    const repo = await import('../../../../src/util/link/repo');
    parseGitConfig = gitMeta.parseGitConfig;
    pluckRemoteUrls = gitMeta.pluckRemoteUrls;
    findRepoRoot = repo.findRepoRoot;

    vi.mocked(findRepoRoot).mockResolvedValue('/test-project');
    vi.mocked(parseGitConfig).mockResolvedValue({
      remote: { origin: { url: 'https://github.com/user/repo.git' } },
    });
    vi.mocked(pluckRemoteUrls).mockReturnValue({
      origin: 'https://github.com/user/repo.git',
    });

    client.nonInteractive = false;
    // Decline, so the assertions are purely about the default offered.
    client.input.confirm = vi.fn().mockResolvedValue(false);
  });

  it('defaults to yes when the app is installed and covers the repo', async () => {
    servePreflight({
      canLink: true,
      appInstalled: true,
      hasVercelAppInstalled: true,
    });

    await resolveGitConnectIntent(client, '/test-project', false);

    expect(confirmDefault()).toBe(true);
  });

  // Everything below is a state where the connect endpoint would throw 400.
  // `canLink` mirrors that endpoint's precondition exactly, so a false value
  // means the prompt is skipped entirely rather than asked with a "no"
  // default: the CLI cannot honor a yes, whatever the specific reason.
  it('does not ask when the app is on the account but not this repo', async () => {
    servePreflight({
      canLink: false,
      reason: 'app_not_installed',
      viewerCanWrite: true,
      appInstalled: false,
      hasVercelAppInstalled: true,
    });

    const intent = await resolveGitConnectIntent(
      client,
      '/test-project',
      false
    );

    expect(client.input.confirm).not.toHaveBeenCalled();
    expect(intent).toBeNull();
    await expect(client.stderr).toOutput('grant the Vercel GitHub App access');
  });

  it('does not ask when the user has no app at all', async () => {
    servePreflight({
      canLink: false,
      reason: 'app_not_installed',
      viewerCanWrite: true,
      appInstalled: false,
      hasVercelAppInstalled: false,
    });

    const intent = await resolveGitConnectIntent(
      client,
      '/test-project',
      false
    );

    expect(client.input.confirm).not.toHaveBeenCalled();
    expect(intent).toBeNull();
    await expect(client.stderr).toOutput('install the Vercel GitHub App');
  });

  it('does not ask when the user lacks write access', async () => {
    servePreflight({
      canLink: false,
      reason: 'repo_no_access',
      viewerCanWrite: false,
      appInstalled: true,
      hasVercelAppInstalled: true,
    });

    const intent = await resolveGitConnectIntent(
      client,
      '/test-project',
      false
    );

    expect(client.input.confirm).not.toHaveBeenCalled();
    expect(intent).toBeNull();
    await expect(client.stderr).toOutput('you need write access');
  });

  it('does not ask when the repo cannot be found', async () => {
    servePreflight({
      canLink: false,
      reason: 'repo_not_found',
      hasVercelAppInstalled: true,
    });

    const intent = await resolveGitConnectIntent(
      client,
      '/test-project',
      false
    );

    expect(client.input.confirm).not.toHaveBeenCalled();
    expect(intent).toBeNull();
  });

  it('does not ask when there is no login connection', async () => {
    servePreflight({
      canLink: false,
      reason: 'login_connection_missing',
    });

    const intent = await resolveGitConnectIntent(
      client,
      '/test-project',
      false
    );

    expect(client.input.confirm).not.toHaveBeenCalled();
    expect(intent).toBeNull();
    await expect(client.stderr).toOutput('add a GitHub Login Connection');
  });

  // The prompt only ever appears when connecting would actually work, so it
  // has no reason to default to anything but yes.
  it('always defaults to yes when it asks at all', async () => {
    servePreflight({ canLink: true, hasVercelAppInstalled: true });

    await resolveGitConnectIntent(client, '/test-project', false);

    expect(client.input.confirm).toHaveBeenCalled();
    expect(confirmDefault()).toBe(true);
  });

  it('defaults to yes when the preflight fails', async () => {
    // A preflight outage must not make linking harder than it was before.
    servePreflight({}, 500);

    await resolveGitConnectIntent(client, '/test-project', false);

    expect(confirmDefault()).toBe(true);
  });

  it('sends the repo and provider the default remote resolves to', async () => {
    let seen: any;
    client.scenario.get('/v1/integrations/repo-link-preflight', (req, res) => {
      seen = req.query;
      res.json({ provider: 'github', repo: 'user/repo', canLink: true });
    });

    await resolveGitConnectIntent(client, '/test-project', false);

    expect(seen.repo).toBe('user/repo');
    expect(seen.type).toBe('github');
  });

  it('preflights `origin` rather than the first remote when several exist', async () => {
    vi.mocked(pluckRemoteUrls).mockReturnValue({
      upstream: 'https://github.com/vercel/upstream-repo.git',
      origin: 'https://github.com/user/repo.git',
    });
    let seen: any;
    client.scenario.get('/v1/integrations/repo-link-preflight', (req, res) => {
      seen = req.query;
      res.json({ provider: 'github', repo: 'user/repo', canLink: true });
    });

    await resolveGitConnectIntent(client, '/test-project', false);

    expect(seen.repo).toBe('user/repo');
  });

  it('never prompts under --yes, regardless of the preflight', async () => {
    servePreflight({ canLink: true, hasVercelAppInstalled: true });

    const intent = await resolveGitConnectIntent(client, '/test-project', true);

    expect(intent).toBeNull();
    expect(client.input.confirm).not.toHaveBeenCalled();
  });

  describe('the tip printed when left unconnected', () => {
    // `--yes` declines, but should still say what to do next. Which advice is
    // correct depends on the same signal that drives the prompt default.
    it('says to install the app when there is none', async () => {
      servePreflight({
        reason: 'app_not_installed',
        hasVercelAppInstalled: false,
        action: {
          label: 'Install GitHub App',
          link: 'https://github.com/apps/vercel',
        },
      });

      await resolveGitConnectIntent(client, '/test-project', true);

      await expect(client.stderr).toOutput('install the Vercel GitHub App');
    });

    it('says to grant access when the app exists but misses the repo', async () => {
      servePreflight({
        reason: 'app_not_installed',
        viewerCanWrite: true,
        appInstalled: false,
        hasVercelAppInstalled: true,
      });

      await resolveGitConnectIntent(client, '/test-project', true);

      await expect(client.stderr).toOutput(
        'grant the Vercel GitHub App access'
      );
    });

    it('links to the repo-access screen, not the install page', async () => {
      servePreflight({
        reason: 'app_not_installed',
        viewerCanWrite: true,
        appInstalled: false,
        hasVercelAppInstalled: true,
      });

      await resolveGitConnectIntent(client, '/test-project', true);

      await expect(client.stderr).toOutput('installations/select_target');
    });

    it('says to ask an admin when the user lacks write access', async () => {
      servePreflight({
        reason: 'repo_no_access',
        viewerCanWrite: false,
        appInstalled: true,
        hasVercelAppInstalled: true,
      });

      await resolveGitConnectIntent(client, '/test-project', true);

      await expect(client.stderr).toOutput('you need write access');
    });

    it('names the login connection without a docs link', async () => {
      servePreflight({
        reason: 'login_connection_missing',
        action: {
          label: 'Add a Login Connection',
          link: 'https://vercel.com/docs/accounts',
        },
      });

      await resolveGitConnectIntent(client, '/test-project', true);

      await expect(client.stderr).toOutput(
        'add a GitHub Login Connection to your account'
      );
      // The API supplies a docs URL here, but it is long enough to wrap the
      // tip onto a second line and the next step is findable without it.
      expect(client.getFullOutput()).not.toContain('vercel.com/docs/accounts');
    });

    it('falls back to a plain tip when the preflight is unavailable', async () => {
      servePreflight({}, 500);

      await resolveGitConnectIntent(client, '/test-project', true);

      await expect(client.stderr).toOutput('user/repo');
    });

    // `setupAndLink` has pages of prompts and detected settings still to come,
    // so it collects the tip and prints it as the closing line instead.
    it('hands the tip to `deferTip` instead of printing it', async () => {
      servePreflight({ reason: 'login_connection_missing' });

      const deferred: string[] = [];
      await resolveGitConnectIntent(client, '/test-project', false, tip =>
        deferred.push(tip)
      );

      expect(deferred).toHaveLength(1);
      expect(deferred[0]).toContain('add a GitHub Login Connection');
      expect(client.getFullOutput()).not.toContain('Login Connection');
    });
  });

  it('never prompts when non-interactive', async () => {
    client.nonInteractive = true;
    servePreflight({ canLink: true, hasVercelAppInstalled: true });

    const intent = await resolveGitConnectIntent(
      client,
      '/test-project',
      false
    );

    expect(intent).toBeNull();
    expect(client.input.confirm).not.toHaveBeenCalled();
  });
});
