import { beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import comments from '../../../../src/commands/comments';
import { inferBranch } from '../../../../src/commands/comments/scope';
import { APIError } from '../../../../src/util/errors-ts';
import getOrgById from '../../../../src/util/projects/get-org-by-id';
import {
  makeMessage,
  makeThread,
  mockedGetLinkedProject,
  mockedGetScope,
  mockLinkedProject,
  mockTeamScope,
} from './helpers';
import { expectDeprecationInJson } from '../../../helpers/deprecation-warning';

vi.mock('../../../../src/util/projects/link');
vi.mock('../../../../src/util/projects/get-org-by-id');
vi.mock('../../../../src/util/get-scope', async importOriginal => {
  const actual =
    await importOriginal<typeof import('../../../../src/util/get-scope')>();
  return { ...actual, default: vi.fn() };
});
vi.mock('../../../../src/commands/comments/scope', async importOriginal => {
  const actual =
    await importOriginal<
      typeof import('../../../../src/commands/comments/scope')
    >();
  return { ...actual, inferBranch: vi.fn() };
});

const mockedInferBranch = vi.mocked(inferBranch);
const mockedGetOrgById = vi.mocked(getOrgById);

describe('comments list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockLinkedProject();
    mockTeamScope();
    mockedGetOrgById.mockResolvedValue(null);
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

    expect(exitCode).toBe(2);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('comments inspect -- <arg>');
  });

  it('points at the subcommand help when flags are unknown', async () => {
    client.setArgv('comments', 'inspect', 'icZ9BnPPINuK', '--branch', 'main');
    const exitCode = await comments(client);

    expect(exitCode).toBe(2);
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
    // `next` is the standard key; `nextCursor` stays for existing scripts.
    expect(parsed.pagination).toEqual({ nextCursor: 'abc', next: 'abc' });
    expect(parsed.threads).toHaveLength(1);
    expect(parsed.threads[0].id).toBe(thread.id);
  });

  it.each([
    '--git-branch',
    '--branch',
  ])('echoes an explicit %s in filters with source flag', async flag => {
    client.scenario.get('/toolbar/threads', (_req, res) => {
      res.json({ pagination: {}, threads: [] });
    });

    client.setArgv('comments', flag, 'main', '--format', 'json');
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.filters.branch).toEqual({ value: 'main', source: 'flag' });
    expect(parsed.scope.inferredBranch).toBeUndefined();
    // The deprecation warning is skipped for JSON output.
    expect(client.stderr.getFullOutput()).not.toContain('deprecated');
  });

  describe('the deprecated --branch', () => {
    const DEPRECATED = '--branch is deprecated. Use --git-branch.';

    it('filters by the branch and warns', async () => {
      let requestQuery: Record<string, unknown> | undefined;
      client.scenario.get('/toolbar/threads', (req, res) => {
        requestQuery = req.query;
        res.json({ pagination: {}, threads: [makeThread()] });
      });

      client.setArgv('comments', '--branch', 'main');
      const exitCode = await comments(client);

      expect(exitCode).toBe(0);
      expect(requestQuery?.branch).toBe('main');
      expect(client.stderr.getFullOutput()).toContain(`! ${DEPRECATED}`);
    });

    it('does not warn for --git-branch', async () => {
      client.scenario.get('/toolbar/threads', (_req, res) => {
        res.json({ pagination: {}, threads: [makeThread()] });
      });

      client.setArgv('comments', '--git-branch', 'main');
      const exitCode = await comments(client);

      expect(exitCode).toBe(0);
      expect(client.stderr.getFullOutput()).not.toContain('deprecated');
    });

    it.each([
      ['comments', '--branch', 'main', '--git-branch', 'feat'],
      ['comments', '--branch', 'main', '--git-branch', 'feat', '--json'],
    ])('exits 2 without a request when both names are given: %j', async (...argv) => {
      let requested = false;
      client.scenario.get('/toolbar/threads', (_req, res) => {
        requested = true;
        res.json({ pagination: {}, threads: [] });
      });

      client.setArgv(...argv);
      const exitCode = await comments(client);

      expect(exitCode).toBe(2);
      expect(requested).toBe(false);
      const message = "Can't use --branch with --git-branch. Use --git-branch.";
      expect(
        client.stdout.getFullOutput() + client.stderr.getFullOutput()
      ).toContain(message);
    });

    it('teaches --git-branch in the next-page hint', async () => {
      client.scenario.get('/toolbar/threads', (_req, res) => {
        res.json({
          pagination: { nextCursor: 'abc' },
          threads: [makeThread()],
        });
      });

      client.setArgv('comments', '--branch', 'a', '--branch=b');
      const exitCode = await comments(client);

      expect(exitCode).toBe(0);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain(
        'comments --git-branch a --git-branch=b --next abc'
      );
      expect(stderr).not.toMatch(/--branch[ =][ab]/);
    });

    it.each([
      ['--git-branch', 'option:git-branch'],
      ['--branch', 'option:branch'],
    ])('tracks %s telemetry without the branch name', async (flag, key) => {
      client.scenario.get('/toolbar/threads', (_req, res) => {
        res.json({ pagination: {}, threads: [makeThread()] });
      });

      client.setArgv('comments', flag, 'secret-branch');
      await comments(client);

      expect(client.telemetryEventStore.readonlyEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key, value: '[REDACTED]' }),
        ])
      );
      expect(
        JSON.stringify(client.telemetryEventStore.readonlyEvents)
      ).not.toContain('secret-branch');
    });
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
    expect(stderr).toContain('comments --git-branch main');
    expect(stderr).not.toContain('--branch main');
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

  it('filters by recorded page path with --page-path', async () => {
    let requestQuery: Record<string, unknown> | undefined;
    client.scenario.get('/toolbar/threads', (req, res) => {
      requestQuery = req.query;
      res.json({ pagination: {}, threads: [] });
    });

    client.setArgv('comments', '--page-path', '/docs/*', '--format', 'json');
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
    expect(requestQuery?.page).toBe('/docs/*');
    expect(client.telemetryEventStore.readonlyEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'option:page-path',
          value: '[REDACTED]',
        }),
      ])
    );
  });

  it('continues accepting --page as a page-path filter', async () => {
    let requestQuery: Record<string, unknown> | undefined;
    client.scenario.get('/toolbar/threads', (req, res) => {
      requestQuery = req.query;
      res.json({ pagination: {}, threads: [] });
    });

    client.setArgv('comments', '--page', '/docs/*', '--format', 'json');
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
    expect(requestQuery?.page).toBe('/docs/*');
    expect(client.telemetryEventStore.readonlyEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'option:page', value: '[REDACTED]' }),
      ])
    );
  });

  it('rejects --author me for an app principal', async () => {
    mockedGetScope.mockResolvedValue({
      contextName: 'my-team',
      team: { id: 'team_dummy', slug: 'my-team' },
      user: null,
      app: { id: 'app_dummy', name: 'Dummy App' },
    } as never);

    client.setArgv('comments', '--author', 'me', '--format', 'json');
    const exitCode = await comments(client);

    expect(exitCode).toBe(1);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      error: {
        code: 'USER_REQUIRED',
        message:
          "Can't resolve `--author me` when authenticated as an app. Use an author ID with `--author`, or authenticate with a user token.",
      },
    });
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

  it('uses local metadata to resolve an explicit project owner and infer the branch', async () => {
    mockedGetLinkedProject.mockResolvedValue({
      status: 'linked',
      project: { id: 'prj_other', name: 'other-project' },
      org: { id: 'team_other', slug: 'other-team', type: 'team' },
      repoRoot: '/repo',
    } as never);
    let requestQuery: Record<string, unknown> | undefined;
    client.scenario.get('/toolbar/threads', (req, res) => {
      requestQuery = req.query;
      res.json({ pagination: {}, threads: [makeThread()] });
    });

    client.setArgv('comments', '--project', 'other-project');
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
    expect(mockedGetLinkedProject).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        projectName: 'other-project',
        projectNameIsExplicit: true,
      })
    );
    expect(requestQuery?.teamId).toBe('team_other');
    expect(requestQuery?.projectId).toBe('prj_other');
    expect(requestQuery?.branch).toBe('feat-x');
  });

  it('does not infer a branch for an explicit project without matching local metadata', async () => {
    mockedGetLinkedProject.mockResolvedValue({
      status: 'linked',
      project: { id: 'prj_other', name: 'other-project' },
      org: { id: 'team_dummy', slug: 'my-team', type: 'team' },
    } as never);
    let requestQuery: Record<string, unknown> | undefined;
    client.scenario.get('/toolbar/threads', (req, res) => {
      requestQuery = req.query;
      res.json({ pagination: {}, threads: [] });
    });

    client.setArgv('comments', '--project', 'other-project');
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
    expect(requestQuery?.branch).toBeUndefined();
    expect(client.stderr.getFullOutput()).toContain('all branches');
  });

  it('resolves a local project when the current scope is a personal account', async () => {
    mockedGetScope.mockResolvedValue({
      contextName: 'personal-account',
      team: null,
      user: { id: 'user_dummy', username: 'personal-account' },
    } as never);
    mockedGetLinkedProject.mockResolvedValue({
      status: 'linked',
      project: { id: 'prj_other', name: 'other-project' },
      org: { id: 'team_other', slug: 'other-team', type: 'team' },
      repoRoot: '/repo',
    } as never);
    let requestQuery: Record<string, unknown> | undefined;
    client.scenario.get('/toolbar/threads', (req, res) => {
      requestQuery = req.query;
      res.json({ pagination: {}, threads: [makeThread()] });
    });

    client.setArgv('comments', '--project', 'other-project');
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
    expect(requestQuery?.teamId).toBe('team_other');
    expect(requestQuery?.branch).toBe('feat-x');
  });

  it('carries scope flags into the inspect hint', async () => {
    mockedGetLinkedProject.mockResolvedValue({
      status: 'linked',
      project: { id: 'prj_other', name: 'other-project' },
      org: { id: 'team_dummy', slug: 'my-team', type: 'team' },
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

  it('names the resolved scope when --project is not found', async () => {
    mockedGetLinkedProject.mockResolvedValue({
      status: 'not_linked',
      org: null,
      project: null,
      orgId: 'team_dummy',
    } as never);
    mockedGetOrgById.mockResolvedValue({
      id: 'team_dummy',
      slug: 'my-team',
      type: 'team',
    });

    client.setArgv('comments', '--project', 'nope');
    const exitCode = await comments(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('nope');
    expect(client.stderr.getFullOutput()).toContain('(my-team)');
  });

  it('preserves the project context exit code in JSON mode', async () => {
    mockedGetLinkedProject.mockResolvedValue({
      status: 'error',
      exitCode: 2,
    } as never);

    client.setArgv(
      'comments',
      '--project',
      'other-project',
      '--format',
      'json'
    );
    const exitCode = await comments(client);

    expect(exitCode).toBe(2);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      error: {
        code: 'PROJECT_CONTEXT_ERROR',
        message: 'Could not resolve the project context.',
      },
    });
  });

  it('writes a JSON error when explicit project resolution fails', async () => {
    mockedGetLinkedProject.mockRejectedValue(
      new APIError(
        'Project lookup failed',
        {
          status: 500,
          headers: new Headers(),
        } as never,
        { code: 'internal_server_error' }
      )
    );

    client.setArgv(
      'comments',
      '--project',
      'other-project',
      '--format',
      'json'
    );
    const exitCode = await comments(client);

    expect(exitCode).toBe(1);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      error: {
        code: 'internal_server_error',
        message: 'Project lookup failed',
      },
    });
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
    expect(stderr).toContain('  Next page:\n    vercel comments --next abc\n');
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

    client.setArgv('comments', '--git-branch', 'a', '--git-branch', 'b');
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('--git-branch a --git-branch b');
    expect(stderr).not.toContain('--git-branch a,b');
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
      "--git-branch 'evil$(rm -rf ~)'"
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
    // POSIX single-quote escape renders as: --git-branch 'feat'\''s'
    expect(client.stderr.getFullOutput()).toContain(
      "--git-branch 'feat'\\''s'"
    );
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

    expect(exitCode).toBe(2);
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

  it('still reads the hidden -N as --next, and warns', async () => {
    let requestQuery: Record<string, unknown> | undefined;
    client.scenario.get('/toolbar/threads', (req, res) => {
      requestQuery = req.query;
      res.json({ pagination: {}, threads: [makeThread()] });
    });

    client.setArgv('comments', '-N', 'cursor123');
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
    expect(requestQuery?.cursor).toBe('cursor123');
    expect(client.stderr.getFullOutput()).toContain(
      '! -N is deprecated. Use --next.'
    );
  });
});

describe('comments list renamed options', () => {
  // Runs `comments list` with a fresh client, recording the threads request.
  async function run(...args: string[]) {
    client.reset();
    vi.clearAllMocks();
    mockLinkedProject();
    mockTeamScope();
    mockedGetOrgById.mockResolvedValue(null);
    mockedInferBranch.mockReturnValue({ value: 'feat-x', source: 'git' });
    let query: Record<string, unknown> | undefined;
    client.scenario.get('/toolbar/threads', (req, res) => {
      query = req.query;
      res.json({ pagination: { next: 'cursor_2' }, threads: [] });
    });
    client.setArgv('comments', 'list', ...args);
    const exitCode = await comments(client);
    return {
      exitCode,
      query,
      stdout: client.stdout.getFullOutput(),
      stderr: client.stderr.getFullOutput(),
    };
  }

  it.each([
    ['--search', ['--search', 'typo'], ['--query', 'typo']],
    [
      '--content-id',
      ['--content-id', 'c1', '--content-id', 'c2'],
      ['--content', 'c1', '--content', 'c2'],
    ],
  ])('still accepts %s, with one warning', async (typed, oldArgs, newArgs) => {
    const now = await run(...newArgs);
    const before = await run(...oldArgs);
    const name = newArgs[0];

    expect(now.exitCode).toBe(0);
    expect(now.stderr).not.toContain('deprecated');
    expect(before.exitCode).toBe(now.exitCode);
    expect(before.query).toEqual(now.query);
    expect(before.stdout).toBe(now.stdout);
    const warning = `! ${typed} is deprecated. Use ${name}.\n`;
    expect(before.stderr.match(/deprecated/g)).toHaveLength(1);
    expect(before.stderr).toContain(warning);
    // The filter summary and the next page name the new option.
    expect(before.stderr.replace(warning, '')).toBe(now.stderr);
    expect(now.stderr).toContain(`${name} `);
    expect(now.stderr).not.toContain(`${typed} `);

    const nowJson = await run(...newArgs, '--json');
    const beforeJson = await run(...oldArgs, '--json');
    expectDeprecationInJson(
      beforeJson.stdout,
      nowJson.stdout,
      `${typed} is deprecated. Use ${name}.`
    );
    expect(beforeJson.stderr).not.toContain('deprecated');
  });

  it.each([
    [['--query', 'a', '--search', 'b'], "Can't use --query with --search."],
    [
      ['--content', 'c1', '--content-id', 'c2'],
      "Can't use --content with --content-id.",
    ],
  ])('rejects %j before any request', async (args, message) => {
    const result = await run(...args);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(message);
    expect(result.query).toBeUndefined();
  });
});
