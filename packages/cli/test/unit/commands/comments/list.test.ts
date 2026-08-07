import { beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import comments from '../../../../src/commands/comments';
import { inferBranch } from '../../../../src/commands/comments/scope';
import getProjectByNameOrId from '../../../../src/util/projects/get-project-by-id-or-name';
import { ProjectNotFound } from '../../../../src/util/errors-ts';
import {
  makeMessage,
  makeThread,
  mockedGetLinkedProject,
  mockedGetScope,
  mockLinkedProject,
  mockTeamScope,
} from './helpers';

vi.mock('../../../../src/util/projects/link');
vi.mock('../../../../src/util/get-scope');
vi.mock('../../../../src/util/projects/get-project-by-id-or-name');
vi.mock('../../../../src/commands/comments/scope', async importOriginal => {
  const actual =
    await importOriginal<
      typeof import('../../../../src/commands/comments/scope')
    >();
  return { ...actual, inferBranch: vi.fn() };
});

const mockedInferBranch = vi.mocked(inferBranch);
const mockedGetProject = vi.mocked(getProjectByNameOrId);

describe('comments list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockLinkedProject();
    mockTeamScope();
    mockedInferBranch.mockReturnValue({ value: 'feat-x', source: 'git' });
  });

  it('lists unresolved comments with inferred branch focus by default', async () => {
    let requestQuery: Record<string, unknown> | undefined;
    client.scenario.get('/toolbar/threads', (req, res) => {
      requestQuery = req.query;
      res.json({ pagination: {}, threads: [makeThread()] });
    });

    client.setArgv('comments');
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
    expect(requestQuery?.teamId).toBe('team_dummy');
    expect(requestQuery?.projectId).toBe('prj_comments');
    expect(requestQuery?.branch).toBe('feat-x');
    expect(requestQuery?.status).toBe('unresolved');
    expect(requestQuery?.limit).toBe('20');

    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('comments-project');
    expect(stderr).toContain('feat-x');
    expect(stderr).toContain('can u read the text?');
    expect(stderr).toContain('selected:');
    expect(stderr).toContain('1 unresolved comment');
    expect(stderr).toContain('comments inspect <id>');
  });

  it('renders a thread summary with reply authors and last activity', async () => {
    const now = Date.now();
    client.scenario.get('/toolbar/threads', (_req, res) => {
      res.json({
        pagination: {},
        threads: [
          makeThread({
            messageCount: 3,
            messages: [
              makeMessage({ id: 'm1', timestamp: now - 60 * 60 * 1000 }),
              makeMessage({
                id: 'm2',
                timestamp: now - 30 * 60 * 1000,
                author: { type: 'app', id: 'oac_v0', name: 'v0' },
              }),
              makeMessage({
                id: 'm3',
                timestamp: now - 5 * 60 * 1000,
                author: { type: 'user', id: 'user_maria', name: 'Maria' },
              }),
            ],
          }),
        ],
      });
    });

    client.setArgv('comments');
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('2 replies');
    expect(stderr).toContain('v0 (app), Maria');
    expect(stderr).toContain('last 5m ago');
  });

  it('does not misattribute the root comment on threads longer than the embedded window', async () => {
    client.scenario.get('/toolbar/threads', (_req, res) => {
      res.json({
        pagination: {},
        threads: [
          makeThread({
            messageCount: 60,
            messages: [makeMessage({ text: 'not actually the root' })],
          }),
        ],
      });
    });

    client.setArgv('comments');
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).not.toContain('not actually the root');
    expect(stderr).toContain('long thread');
    expect(stderr).toContain('59 replies');
  });

  it('discloses the -- idiom when a dash-leading ID is eaten by the parser', async () => {
    client.setArgv('comments', 'inspect', '-ULOL');
    const exitCode = await comments(client);

    expect(exitCode).toBe(1);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('comments inspect -- <arg>');
  });

  it('points at the subcommand help when flags are unknown', async () => {
    client.setArgv('comments', 'inspect', 'icZ9BnPPINuK', '--branch', 'main');
    const exitCode = await comments(client);

    expect(exitCode).toBe(1);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('--branch');
    expect(stderr).toContain('comments inspect --help');
  });

  it('drops the branch filter with --all-branches and shows a branch column', async () => {
    let requestQuery: Record<string, unknown> | undefined;
    client.scenario.get('/toolbar/threads', (req, res) => {
      requestQuery = req.query;
      res.json({ pagination: {}, threads: [makeThread()] });
    });

    client.setArgv('comments', '--all-branches');
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
    expect(requestQuery?.branch).toBeUndefined();
    expect(client.stderr.getFullOutput()).toContain('all branches');
  });

  it('does not filter by branch when inference fails', async () => {
    mockedInferBranch.mockReturnValue(undefined);
    let requestQuery: Record<string, unknown> | undefined;
    client.scenario.get('/toolbar/threads', (req, res) => {
      requestQuery = req.query;
      res.json({ pagination: {}, threads: [] });
    });

    client.setArgv('comments');
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
    expect(requestQuery?.branch).toBeUndefined();
  });

  it('rejects unexpected positional tokens instead of silently listing', async () => {
    client.setArgv('comments', 'resovle', 'icZ9BnPPINuK');
    const exitCode = await comments(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('resovle');
  });

  it('rejects extra positionals after an explicit list subcommand', async () => {
    client.setArgv('comments', 'ls', 'extra');
    const exitCode = await comments(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('extra');
  });

  it('emits a JSON envelope with scope, filters, and threads', async () => {
    const thread = makeThread();
    client.scenario.get('/toolbar/threads', (_req, res) => {
      res.json({ pagination: { nextCursor: 'abc' }, threads: [thread] });
    });

    client.setArgv('comments', '--format', 'json');
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).not.toContain('Fetching comments');
    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.scope).toEqual({
      teamId: 'team_dummy',
      teamSlug: 'my-team',
      projectId: 'prj_comments',
      projectName: 'comments-project',
      inferredBranch: 'feat-x',
    });
    expect(parsed.filters).toEqual({
      status: 'unresolved',
      branch: { value: 'feat-x', source: 'git' },
    });
    expect(parsed.pagination).toEqual({ nextCursor: 'abc' });
    expect(parsed.threads).toHaveLength(1);
    expect(parsed.threads[0].id).toBe(thread.id);
  });

  it('echoes an explicit --branch in filters with source flag', async () => {
    client.scenario.get('/toolbar/threads', (_req, res) => {
      res.json({ pagination: {}, threads: [] });
    });

    client.setArgv('comments', '--branch', 'main', '--format', 'json');
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.filters.branch).toEqual({ value: 'main', source: 'flag' });
    expect(parsed.scope.inferredBranch).toBeUndefined();
  });

  it('suggests the exact branch when empty and all probe results share one', async () => {
    let calls = 0;
    client.scenario.get('/toolbar/threads', (req, res) => {
      calls += 1;
      if (req.query.branch) {
        res.json({ pagination: {}, threads: [] });
      } else {
        res.json({
          pagination: {},
          threads: [
            makeThread({ id: 't1', branch: 'main' }),
            makeThread({ id: 't2', branch: 'main' }),
          ],
        });
      }
    });

    client.setArgv('comments');
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
    expect(calls).toBe(2);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('No unresolved comments on feat-x');
    expect(stderr).toContain('--branch main');
  });

  it('suggests --all-branches when empty and probe spans branches', async () => {
    client.scenario.get('/toolbar/threads', (req, res) => {
      if (req.query.branch) {
        res.json({ pagination: {}, threads: [] });
      } else {
        res.json({
          pagination: {},
          threads: [
            makeThread({ id: 't1', branch: 'main' }),
            makeThread({ id: 't2', branch: 'docs-fix' }),
          ],
        });
      }
    });

    client.setArgv('comments');
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).toContain('--all-branches');
  });

  it('skips the probe in JSON mode', async () => {
    let calls = 0;
    client.scenario.get('/toolbar/threads', (_req, res) => {
      calls += 1;
      res.json({ pagination: {}, threads: [] });
    });

    client.setArgv('comments', '--format', 'json');
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
    expect(calls).toBe(1);
  });

  it('resolves --author me to the current user id', async () => {
    let requestQuery: Record<string, unknown> | undefined;
    client.scenario.get('/toolbar/threads', (req, res) => {
      requestQuery = req.query;
      res.json({ pagination: {}, threads: [] });
    });

    client.setArgv('comments', '--author', 'me', '--format', 'json');
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
    expect(requestQuery?.author).toBe('user_dummy');
  });

  it('discloses the author filter with an ID hint on empty results', async () => {
    client.scenario.get('/toolbar/threads', (_req, res) => {
      res.json({ pagination: {}, threads: [] });
    });

    client.setArgv('comments', '--author', 'julianbenegas', '--all-branches');
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('--author julianbenegas');
    expect(stderr).toContain('user ID');
  });

  it('errors actionably when not linked and no --project is given', async () => {
    mockedGetLinkedProject.mockResolvedValue({
      status: 'not_linked',
      org: null,
      project: null,
    } as never);

    client.setArgv('comments');
    const exitCode = await comments(client);

    expect(exitCode).toBe(1);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('vercel link');
    expect(stderr).toContain('--project');
  });

  it('resolves an explicit --project against the current team', async () => {
    mockedGetProject.mockResolvedValue({
      id: 'prj_other',
      name: 'other-project',
    } as never);
    let requestQuery: Record<string, unknown> | undefined;
    client.scenario.get('/toolbar/threads', (req, res) => {
      requestQuery = req.query;
      res.json({ pagination: {}, threads: [] });
    });

    client.setArgv('comments', '--project', 'other-project');
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
    expect(mockedGetProject).toHaveBeenCalledWith(
      client,
      'other-project',
      'team_dummy'
    );
    expect(requestQuery?.projectId).toBe('prj_other');
    // Branch inference is gated on link-sourced scope: with an explicit
    // --project, the cwd's git branch belongs to some unrelated checkout.
    expect(requestQuery?.branch).toBeUndefined();
    expect(client.stderr.getFullOutput()).toContain('all branches');
  });

  it('carries scope flags into the inspect hint', async () => {
    mockedGetProject.mockResolvedValue({
      id: 'prj_other',
      name: 'other-project',
    } as never);
    client.scenario.get('/toolbar/threads', (_req, res) => {
      res.json({ pagination: {}, threads: [makeThread()] });
    });

    client.setArgv('comments', '--project', 'other-project');
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).toContain(
      'comments inspect <id> --project other-project'
    );
  });

  it('errors when --project is not found in the team', async () => {
    mockedGetProject.mockResolvedValue(new ProjectNotFound('nope') as never);

    client.setArgv('comments', '--project', 'nope');
    const exitCode = await comments(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('nope');
  });

  it('writes the JSON error envelope to stdout and exits 1 on API failure', async () => {
    client.scenario.get('/toolbar/threads', (_req, res) => {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Insufficient access' },
      });
    });

    client.setArgv('comments', '--format', 'json');
    const exitCode = await comments(client);

    expect(exitCode).toBe(1);
    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.error.code).toBeTruthy();
    expect(parsed.error.message).toBeTruthy();
  });

  it('never leaks --token into suggested commands', async () => {
    client.scenario.get('/toolbar/threads', (_req, res) => {
      res.json({
        pagination: { nextCursor: 'abc' },
        threads: [makeThread()],
      });
    });

    client.setArgv('comments', '--token', 'sekrit123');
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('To display the next page');
    expect(stderr).not.toContain('sekrit123');
    expect(stderr).not.toContain('--token');
  });

  it('round-trips repeatable flags as repeated flags in the next-page hint', async () => {
    client.scenario.get('/toolbar/threads', (_req, res) => {
      res.json({
        pagination: { nextCursor: 'abc' },
        threads: [makeThread()],
      });
    });

    client.setArgv('comments', '--branch', 'a', '--branch', 'b');
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('--branch a --branch b');
    expect(stderr).not.toContain('--branch a,b');
  });

  it('quotes remote branch names in probe suggestions', async () => {
    client.scenario.get('/toolbar/threads', (req, res) => {
      if (req.query.branch) {
        res.json({ pagination: {}, threads: [] });
      } else {
        res.json({
          pagination: {},
          threads: [makeThread({ id: 't1', branch: 'evil$(rm -rf ~)' })],
        });
      }
    });

    client.setArgv('comments');
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).toContain(
      "--branch 'evil$(rm -rf ~)'"
    );
  });

  it('escapes single quotes in remote branch names POSIX-correctly', async () => {
    client.scenario.get('/toolbar/threads', (req, res) => {
      if (req.query.branch) {
        res.json({ pagination: {}, threads: [] });
      } else {
        res.json({
          pagination: {},
          threads: [makeThread({ id: 't1', branch: "feat's" })],
        });
      }
    });

    client.setArgv('comments');
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
    // POSIX single-quote escape renders as: --branch 'feat'\''s'
    expect(client.stderr.getFullOutput()).toContain("--branch 'feat'\\''s'");
  });

  it('honors an explicit --scope over the linked directory', async () => {
    mockedGetScope.mockResolvedValue({
      contextName: 'other-team',
      team: { id: 'team_other', slug: 'other-team' },
      user: { id: 'user_dummy' },
    } as never);
    client.setArgv('comments', '--scope', 'other-team');
    const exitCode = await comments(client);

    // Linked project belongs to team_dummy; explicit scope selects
    // team_other -> listing requires --project rather than silently using
    // the linked project's team.
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('--project');
  });

  it('rejects an invalid --status', async () => {
    client.setArgv('comments', '--status', 'closed');
    const exitCode = await comments(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('closed');
  });

  it('passes the opaque cursor through and prints the next-page hint', async () => {
    let requestQuery: Record<string, unknown> | undefined;
    client.scenario.get('/toolbar/threads', (req, res) => {
      requestQuery = req.query;
      res.json({
        pagination: { nextCursor: 'dGhyZWFk' },
        threads: [makeThread()],
      });
    });

    client.setArgv('comments', '--next', 'cursor123');
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
    expect(requestQuery?.cursor).toBe('cursor123');
    expect(client.stderr.getFullOutput()).toContain('--next dGhyZWFk');
  });
});
