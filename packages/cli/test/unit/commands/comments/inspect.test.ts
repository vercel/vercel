import { beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import comments from '../../../../src/commands/comments';
import {
  makeMessage,
  makeThread,
  mockLinkedProject,
  mockTeamScope,
} from './helpers';

vi.mock('../../../../src/util/projects/link');
vi.mock('../../../../src/util/get-scope');

describe('comments inspect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockLinkedProject();
    mockTeamScope();
  });

  it('renders the thread detail including message IDs', async () => {
    const thread = makeThread();
    client.scenario.get('/toolbar/threads/:id', (req, res) => {
      expect(req.params.id).toBe('icZ9BnPPINuK');
      expect(req.query.teamId).toBe('team_dummy');
      res.json(thread);
    });

    client.setArgv('comments', 'inspect', 'icZ9BnPPINuK');
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('icZ9BnPPINuK');
    expect(stderr).toContain('unresolved');
    expect(stderr).toContain('msg_1'); // message ID rendered
    expect(stderr).toContain('can u read the text?');
    expect(stderr).toContain('Selected');
    expect(stderr).toContain(thread.webUrl!);
  });

  it('accepts the thread webUrl and scopes to the URL’s team', async () => {
    let requestedId: string | undefined;
    let requestedTeam: string | undefined;
    client.scenario.get('/toolbar/threads/:id', (req, res) => {
      requestedId = req.params.id;
      requestedTeam = req.query.teamId as string;
      res.json(makeThread());
    });

    client.setArgv(
      'comments',
      'inspect',
      'https://vercel.com/url-team/comments-project/c/icZ9BnPPINuK?s=15'
    );
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
    expect(requestedId).toBe('icZ9BnPPINuK');
    // The dashboard URL is the thread's canonical address: its team wins
    // over the linked project's org when no explicit --scope is given.
    expect(requestedTeam).toBe('url-team');
  });

  it('works via the get alias', async () => {
    client.scenario.get('/toolbar/threads/:id', (_req, res) => {
      res.json(makeThread());
    });

    client.setArgv('comments', 'get', 'icZ9BnPPINuK');
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
  });

  it('honors an explicit --scope over the linked directory for thread fetches', async () => {
    const getScopeModule = await import('../../../../src/util/get-scope');
    vi.mocked(getScopeModule.default).mockResolvedValue({
      contextName: 'other-team',
      team: { id: 'team_other', slug: 'other-team' },
      user: { id: 'user_dummy' },
    } as never);
    let requestedTeam: string | undefined;
    client.scenario.get('/toolbar/threads/:id', (req, res) => {
      requestedTeam = req.query.teamId as string;
      res.json(makeThread());
    });

    client.setArgv(
      'comments',
      'inspect',
      'icZ9BnPPINuK',
      '--scope',
      'other-team'
    );
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
    expect(requestedTeam).toBe('team_other');
  });

  it('requires a thread argument in JSON mode instead of prompting', async () => {
    client.setArgv('comments', 'inspect', '--format', 'json');
    const exitCode = await comments(client);

    expect(exitCode).toBe(1);
    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.error.code).toBe('MISSING_THREAD');
  });

  it('reports a friendly not-found for unknown IDs', async () => {
    client.scenario.get('/toolbar/threads/:id', (_req, res) => {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Not found' },
      });
    });

    client.setArgv('comments', 'inspect', 'nope');
    const exitCode = await comments(client);

    expect(exitCode).toBe(1);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Comment not found: nope in team my-team');
    expect(stderr).toContain('--scope');
  });

  it('fetches the complete message list when messageCount exceeds the embedded window', async () => {
    const thread = makeThread({
      messageCount: 3,
      messages: [makeMessage({ id: 'msg_embedded' })],
    });
    client.scenario.get('/toolbar/threads/:id', (_req, res) => {
      res.json(thread);
    });
    client.scenario.get('/toolbar/threads/:id/messages', (_req, res) => {
      res.json({
        pagination: {},
        messages: [
          makeMessage({ id: 'msg_a' }),
          makeMessage({ id: 'msg_b' }),
          makeMessage({ id: 'msg_c' }),
        ],
      });
    });

    client.setArgv('comments', 'inspect', 'icZ9BnPPINuK', '--format', 'json');
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).not.toContain('Fetching comment');
    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.messages.map((m: { id: string }) => m.id)).toEqual([
      'msg_a',
      'msg_b',
      'msg_c',
    ]);
  });

  it.each([
    ['non-interactive mode', () => (client.nonInteractive = true)],
    ['non-TTY stdin', () => (client.stdin.isTTY = false)],
  ])('errors with usage when no thread is given in %s', async (_name, configure) => {
    configure();
    client.input.select = vi.fn();
    client.setArgv('comments', 'inspect');
    const exitCode = await comments(client);

    expect(exitCode).toBe(1);
    expect(client.input.select).not.toHaveBeenCalled();
    expect(client.stderr.getFullOutput()).toContain('thread');
  });
});
