import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../src/util/sleep', () => ({ default: vi.fn() }));
import type { Response } from 'express';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import {
  createCiGitRepo,
  createCiInvocation,
  createCiTree,
} from '../../../mocks/ci';
import ci from '../../../../src/commands/ci';
import sleep from '../../../../src/util/sleep';
import type { CiTaskConclusion } from '../../../../src/util/ci/types';

type Query = Record<string, string | string[] | undefined>;

const TASK_LOGS_PATH =
  '/v1/vercel-ci/invocations/:invocationId/attempts/:attempt/task-logs';
const TASK_RUN_LOGS_PATH =
  '/v1/vercel-ci/invocations/:invocationId/attempts/:attempt/job-definitions/:jobDefinitionId/runs/:runAttempt/task-definitions/:taskDefinitionId/runs/:taskRunAttempt/logs';

function failedTask(lines: Array<{ message: string; level?: string }>) {
  return {
    jobDefinitionId: 'jobd1_turbo',
    jobName: 'turbo run build test',
    jobRunAttempt: 1,
    taskDefinitionId: 'tskd1_webtest',
    taskName: 'web#test',
    taskRunAttempt: 1,
    conclusion: { result: 'failed', reason: 'command_failed' },
    lines: lines.map((line, i) => ({
      level: line.level ?? 'info',
      timestamp: Date.UTC(2026, 8, 1, 0, 0, i),
      message: line.message,
    })),
  };
}

function writeLines(res: Response, lines: unknown[]) {
  if (res.req.query.follow !== '1') {
    res.json({ lines });
    return;
  }
  res.setHeader('content-type', 'application/stream+json');
  for (const line of lines) {
    res.write(`${JSON.stringify(line)}\n`);
  }
  res.end();
}

describe('ci logs', () => {
  let sha: string;

  beforeEach(() => {
    vi.clearAllMocks();
    useUser();
    const repo = createCiGitRepo();
    client.cwd = repo.cwd;
    sha = repo.sha;
  });

  it('shows logs for the failed tasks of the current commit', async () => {
    client.scenario.get('/v2/vercel-ci/invocations', (_req, res) => {
      res.json({
        invocations: [
          createCiInvocation({
            invocationId: 'invo1_head',
            // Legacy listings can return the first attempt, not the latest.
            attempt: 1,
            commitSha: sha,
          }),
        ],
        repositories: {},
        pagination: {},
      });
    });
    client.scenario.get(
      '/v1/vercel-ci/invocations/:invocationId/attempts',
      (_req, res) =>
        res.json({
          attempts: [
            createCiInvocation({ attempt: 1 }),
            createCiInvocation({ attempt: 2 }),
          ],
        })
    );
    let params: Record<string, string> = {};
    let query: Query = {};
    client.scenario.get(TASK_LOGS_PATH, (req, res) => {
      params = req.params;
      query = req.query as Query;
      res.json({
        tasks: [
          failedTask([
            { message: 'FAIL src/router.test.ts' },
            { message: '', level: 'eof' },
          ]),
        ],
        hasMore: false,
      });
    });

    client.setArgv('ci', 'logs', '--failed');
    const exitCode = await ci(client);

    expect(exitCode).toBe(0);
    expect(params).toMatchObject({ invocationId: 'invo1_head', attempt: '2' });
    expect(query.conclusion).toBe('failed');
    expect(client.stderr.getFullOutput()).toContain(
      'web#test · failed · command_failed'
    );
    expect(client.stdout.getFullOutput()).toBe('FAIL src/router.test.ts\n');
  });

  it('uses the latest attempt of a run given by ID', async () => {
    client.scenario.get(
      '/v1/vercel-ci/invocations/:invocationId/attempts',
      (_req, res) => {
        res.json({
          attempts: [
            createCiInvocation({ attempt: 1 }),
            createCiInvocation({ attempt: 3 }),
          ],
          repositories: {},
        });
      }
    );
    let attempt: string | undefined;
    client.scenario.get(TASK_LOGS_PATH, (req, res) => {
      attempt = req.params.attempt;
      res.json({ tasks: [], hasMore: false });
    });

    client.setArgv('ci', 'logs', 'abc123');
    const exitCode = await ci(client);

    expect(exitCode).toBe(0);
    expect(attempt).toBe('3');
    expect(client.stderr.getFullOutput()).toContain(
      'No tasks match the current filters.'
    );
  });

  it('passes repeated task and level filters', async () => {
    let query: Query = {};
    client.scenario.get(TASK_LOGS_PATH, (req, res) => {
      query = req.query as Query;
      res.json({ tasks: [], hasMore: false });
    });

    client.setArgv(
      'ci',
      'logs',
      'abc123',
      '--attempt',
      '1',
      '--task',
      'web#test',
      '--task',
      'api#test',
      '--level',
      'error',
      '--level',
      'fatal',
      '--limit',
      '5'
    );
    const exitCode = await ci(client);

    expect(exitCode).toBe(0);
    expect(query).toMatchObject({
      task: ['web#test', 'api#test'],
      level: ['error', 'fatal'],
      limit: '5',
    });
  });

  it('prints logs as JSON without internal IDs', async () => {
    client.scenario.get(TASK_LOGS_PATH, (_req, res) => {
      res.json({
        tasks: [failedTask([{ message: 'boom', level: 'error' }])],
        hasMore: false,
      });
    });

    client.setArgv(
      'ci',
      'logs',
      'abc123',
      '--attempt',
      '1',
      '--format',
      'json'
    );
    const exitCode = await ci(client);

    expect(exitCode).toBe(0);
    const stdout = client.stdout.getFullOutput();
    expect(JSON.parse(stdout)).toEqual({
      run: { id: 'abc123', attempt: 1 },
      tasks: [
        {
          job: 'turbo run build test',
          name: 'web#test',
          status: 'failed',
          reason: 'command_failed',
          lines: [
            {
              timestamp: '2026-09-01T00:00:00.000Z',
              level: 'error',
              message: 'boom',
            },
          ],
        },
      ],
      hasMore: false,
    });
    expect(stdout).not.toMatch(/invo1_|jobd1_|tskd1_/);
  });

  function useAttempt(setup: 'succeeded' | 'failed') {
    client.scenario.get(
      '/v1/vercel-ci/invocations/:invocationId/attempts/:attempt',
      (_req, res) => {
        res.json({
          invocation: createCiInvocation({
            setupConclusion: { result: setup },
          }),
          repositories: {},
        });
      }
    );
  }

  it('shows setup logs when the run failed before any tasks', async () => {
    client.scenario.get(TASK_LOGS_PATH, (_req, res) => {
      res.json({ tasks: [], hasMore: false });
    });
    useAttempt('failed');
    client.scenario.get(
      '/v1/vercel-ci/invocations/:invocationId/attempts/:attempt/logs',
      (_req, res) => {
        res.json({
          lines: [
            { level: 'error', timestamp: 1, message: 'pnpm install failed' },
          ],
        });
      }
    );

    client.setArgv('ci', 'logs', 'abc123', '--attempt', '1', '--failed');
    const exitCode = await ci(client);

    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).toContain('Setup · failed');
    expect(client.stdout.getFullOutput()).toBe('pnpm install failed\n');
  });

  it('includes setup logs in JSON output', async () => {
    client.scenario.get(TASK_LOGS_PATH, (_req, res) => {
      res.json({ tasks: [], hasMore: false });
    });
    useAttempt('failed');
    client.scenario.get(
      '/v1/vercel-ci/invocations/:invocationId/attempts/:attempt/logs',
      (_req, res) => {
        res.json({
          lines: [{ level: 'error', timestamp: 0, message: 'clone failed' }],
        });
      }
    );

    client.setArgv(
      'ci',
      'logs',
      'abc123',
      '--attempt',
      '1',
      '--failed',
      '--format',
      'json'
    );
    const exitCode = await ci(client);

    expect(exitCode).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      tasks: [],
      setup: {
        status: 'failed',
        lines: [{ level: 'error', message: 'clone failed' }],
      },
    });
  });

  it('says when a run has no failed tasks', async () => {
    client.scenario.get(TASK_LOGS_PATH, (_req, res) => {
      res.json({ tasks: [], hasMore: false });
    });
    useAttempt('succeeded');
    client.scenario.get(
      '/v1/vercel-ci/invocations/:invocationId/tree',
      (_req, res) => res.json(createCiTree())
    );

    client.setArgv('ci', 'logs', 'abc123', '--attempt', '1', '--failed');
    const exitCode = await ci(client);

    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).toContain(
      'No failed tasks in this run.'
    );
  });

  it('does not imply a running run without failures has finished', async () => {
    client.scenario.get(TASK_LOGS_PATH, (_req, res) => {
      res.json({ tasks: [], hasMore: false });
    });
    useAttempt('succeeded');
    client.scenario.get(
      '/v1/vercel-ci/invocations/:invocationId/tree',
      (_req, res) => res.json(createCiTree({ running: true }))
    );
    client.setArgv('ci', 'logs', 'abc123', '--attempt', '1', '--failed');

    expect(await ci(client)).toBe(0);
    expect(client.stderr.getFullOutput()).toContain(
      'No failed tasks yet. The run is still in progress.'
    );
    expect(client.stderr.getFullOutput()).not.toContain(
      'No failed tasks in this run.'
    );
  });

  it.each(
    [
      { running: true, nonInteractive: false },
      { running: false, nonInteractive: false },
      { running: true, nonInteractive: true },
      { running: false, nonInteractive: true },
    ].flatMap(mode => [false, true].map(withTask => ({ ...mode, withTask })))
  )('exposes completion for empty failed-task JSON ($running, $nonInteractive, task=$withTask)', async ({
    running,
    nonInteractive,
    withTask,
  }) => {
    client.scenario.get(TASK_LOGS_PATH, (_req, res) => {
      res.json({ tasks: [], hasMore: false });
    });
    useAttempt('succeeded');
    client.scenario.get(
      '/v1/vercel-ci/invocations/:invocationId/tree',
      (req, res) => {
        expect(req.query.attempt).toBe('2');
        res.json(createCiTree({ running }));
      }
    );
    client.nonInteractive = nonInteractive;
    client.setArgv(
      'ci',
      'logs',
      'abc123',
      '--attempt',
      '2',
      '--failed',
      ...(withTask ? ['--task', 'web#test'] : []),
      ...(nonInteractive ? [] : ['--json'])
    );

    expect(await ci(client)).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      run: { id: 'abc123', attempt: 2, finished: !running },
      tasks: [],
      hasMore: false,
    });
    expect(client.stderr.getFullOutput()).not.toContain('No failed tasks');
    expect(client.stderr.getFullOutput()).not.toContain('Fetching task logs');
  });

  it.each([
    false,
    true,
  ])('sanitizes human task output but keeps JSON raw (json=%s)', async asJson => {
    const message =
      '\u001b[31mred\u001b[0m\u001b]8;;https://example.com\u0007link\u001b]8;;\u0007\r\n\t\b\u0000';
    const name = '\u001b[2Jweb#test\n\u0007';
    client.scenario.get(TASK_LOGS_PATH, (_req, res) => {
      res.json({
        tasks: [
          {
            ...failedTask([{ message }]),
            taskName: name,
            conclusion: { result: 'failed', reason: 'command\rfailed' },
          },
        ],
        hasMore: false,
      });
    });
    client.setArgv(
      'ci',
      'logs',
      'abc123',
      '--attempt',
      '1',
      ...(asJson ? ['--json'] : [])
    );

    expect(await ci(client)).toBe(0);
    if (asJson) {
      expect(JSON.parse(client.stdout.getFullOutput()).tasks[0]).toMatchObject({
        name,
        reason: 'command\rfailed',
        lines: [{ message }],
      });
    } else {
      expect(client.stdout.getFullOutput()).toBe(
        'redlink\\r\\n\\t\\b\\u0000\n'
      );
      expect(client.stderr.getFullOutput()).toContain(
        'web#test\\n\\u0007 · failed · command\\rfailed'
      );
      expect(client.stderr.getFullOutput()).not.toContain('\u001b[2J');
    }
  });

  it.each([
    false,
    true,
  ])('sanitizes setup output but keeps JSON raw (json=%s)', async asJson => {
    const message = '\u001b[31mclone\u001b[0m\nfailed\u0007';
    client.scenario.get(TASK_LOGS_PATH, (_req, res) =>
      res.json({ tasks: [], hasMore: false })
    );
    useAttempt('failed');
    client.scenario.get(
      '/v1/vercel-ci/invocations/:invocationId/attempts/:attempt/logs',
      (_req, res) => {
        res.json({ lines: [{ level: 'error', timestamp: 1, message }] });
      }
    );
    client.setArgv(
      'ci',
      'logs',
      'abc123',
      '--attempt',
      '1',
      '--failed',
      ...(asJson ? ['--json'] : [])
    );

    expect(await ci(client)).toBe(0);
    if (asJson) {
      expect(
        JSON.parse(client.stdout.getFullOutput()).setup.lines[0].message
      ).toBe(message);
    } else {
      expect(client.stdout.getFullOutput()).toBe('clone\\nfailed\\u0007\n');
    }
  });

  it('notes when more tasks matched than were returned', async () => {
    client.scenario.get(TASK_LOGS_PATH, (_req, res) => {
      res.json({ tasks: [failedTask([])], hasMore: true });
    });

    client.setArgv('ci', 'logs', 'abc123', '--attempt', '1');
    const exitCode = await ci(client);

    expect(exitCode).toBe(0);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('No log lines.');
    expect(stderr).toContain('More tasks match; narrow with --task');
  });

  it('rejects an unknown level', async () => {
    client.setArgv('ci', 'logs', 'abc123', '--level', 'loud');
    const exitCode = await ci(client);

    expect(exitCode).toBe(2);
    expect(client.stderr.getFullOutput()).toContain('Level must be one of:');
  });

  describe('--grep', () => {
    function task(name: string, messages: string[]) {
      return {
        ...failedTask(messages.map(message => ({ message }))),
        taskName: name,
        conclusion: { result: 'succeeded' },
      };
    }

    it('searches every task and prefixes lines with the task name', async () => {
      let query: Query = {};
      client.scenario.get(TASK_LOGS_PATH, (req, res) => {
        query = req.query as Query;
        res.json({
          tasks: [
            task('docs#build', ['WARNING: deprecated option']),
            task('web#build', ['warning: large bundle', 'warning: slow page']),
          ],
          hasMore: false,
        });
      });

      client.setArgv(
        'ci',
        'logs',
        'abc123',
        '--attempt',
        '1',
        '--grep',
        'warning'
      );
      const exitCode = await ci(client);

      expect(exitCode).toBe(0);
      expect(query.search).toBe('warning');
      expect(query.limit).toBeUndefined();
      expect(client.stdout.getFullOutput()).toBe(
        [
          'docs#build  WARNING: deprecated option',
          'web#build   warning: large bundle',
          'web#build   warning: slow page',
          '',
        ].join('\n')
      );
      expect(client.stderr.getFullOutput()).toContain(
        '3 matching lines in 2 tasks'
      );
    });

    it('says when nothing matches', async () => {
      client.scenario.get(TASK_LOGS_PATH, (_req, res) => {
        res.json({ tasks: [], hasMore: false });
      });

      client.setArgv(
        'ci',
        'logs',
        'abc123',
        '--attempt',
        '1',
        '--grep',
        'segfault'
      );
      const exitCode = await ci(client);

      expect(exitCode).toBe(0);
      expect(client.stderr.getFullOutput()).toContain(
        'No log lines match "segfault".'
      );
    });

    it.each([
      false,
      true,
    ])('sanitizes grep labels and messages but preserves JSON (json=%s)', async asJson => {
      const name = '\u001b[2Jweb#build\n';
      const message =
        '\u001b[31mwarning\u001b[0m\u001b]8;;https://example.com\u0007link\u001b]8;;\u0007\r\u0000';
      client.scenario.get(TASK_LOGS_PATH, (_req, res) =>
        res.json({ tasks: [task(name, [message])], hasMore: false })
      );
      client.setArgv(
        'ci',
        'logs',
        'abc123',
        '--attempt',
        '1',
        '--grep',
        'warning',
        ...(asJson ? ['--json'] : [])
      );

      expect(await ci(client)).toBe(0);
      if (asJson) {
        expect(
          JSON.parse(client.stdout.getFullOutput()).tasks[0]
        ).toMatchObject({ name, lines: [{ message }] });
      } else {
        expect(client.stdout.getFullOutput()).toBe(
          'web#build\\n  warninglink\\r\\u0000\n'
        );
      }
    });

    it.each([
      false,
      true,
    ])('sanitizes an empty grep value display (setup=%s)', async setup => {
      const grep = '\u001b[31mx\u001b[0m\n\u0007';
      let search: unknown;
      client.scenario.get(TASK_LOGS_PATH, (req, res) => {
        search = req.query.search;
        res.json({ tasks: [], hasMore: false });
      });
      if (setup) {
        useAttempt('failed');
        client.scenario.get(
          '/v1/vercel-ci/invocations/:invocationId/attempts/:attempt/logs',
          (_req, res) => res.json({ lines: [] })
        );
      }
      client.setArgv(
        'ci',
        'logs',
        'abc123',
        '--attempt',
        '1',
        '--grep',
        grep,
        ...(setup ? ['--failed'] : [])
      );

      expect(await ci(client)).toBe(0);
      expect(search).toBe(grep);
      expect(client.stderr.getFullOutput()).toContain(
        `No ${setup ? 'setup ' : ''}log lines match "x\\n\\u0007".`
      );
      expect(client.stderr.getFullOutput()).not.toContain('\u001b[31m');
    });

    it('does not loop when the displayed grep is empty after sanitization', async () => {
      client.scenario.get(TASK_LOGS_PATH, (_req, res) =>
        res.json({
          tasks: [task('web#build', ['\u001b[31mwarning'])],
          hasMore: false,
        })
      );
      client.setArgv(
        'ci',
        'logs',
        'abc123',
        '--attempt',
        '1',
        '--grep',
        '\u001b[31m'
      );
      expect(await ci(client)).toBe(0);
      expect(client.stdout.getFullOutput()).toBe('web#build  warning\n');
    });

    it('sanitizes matching setup log output', async () => {
      client.scenario.get(TASK_LOGS_PATH, (_req, res) =>
        res.json({ tasks: [], hasMore: false })
      );
      useAttempt('failed');
      client.scenario.get(
        '/v1/vercel-ci/invocations/:invocationId/attempts/:attempt/logs',
        (_req, res) =>
          res.json({
            lines: [
              {
                level: 'error',
                timestamp: 1,
                message: '\u001b[31mwarning\u001b[0m\n\u0007',
              },
            ],
          })
      );
      client.setArgv(
        'ci',
        'logs',
        'abc123',
        '--attempt',
        '1',
        '--failed',
        '--grep',
        'warning'
      );
      expect(await ci(client)).toBe(0);
      expect(client.stdout.getFullOutput()).toBe('warning\\n\\u0007\n');
    });

    it('notes when more lines matched than were returned', async () => {
      client.scenario.get(TASK_LOGS_PATH, (_req, res) => {
        res.json({
          tasks: [task('web#build', ['warning'])],
          hasMore: true,
        });
      });

      client.setArgv(
        'ci',
        'logs',
        'abc123',
        '--attempt',
        '1',
        '--grep',
        'warning'
      );
      await ci(client);

      expect(client.stderr.getFullOutput()).toContain(
        'Showing the first 1 matching lines. Narrow with --task, --failed, or --level.'
      );
    });

    it('prints matches as JSON', async () => {
      client.scenario.get(TASK_LOGS_PATH, (_req, res) => {
        res.json({
          tasks: [task('web#build', ['warning: large bundle'])],
          hasMore: false,
        });
      });

      client.setArgv(
        'ci',
        'logs',
        'abc123',
        '--attempt',
        '1',
        '--grep',
        'warning',
        '--format',
        'json'
      );
      const exitCode = await ci(client);

      expect(exitCode).toBe(0);
      expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
        tasks: [
          {
            name: 'web#build',
            lines: [{ message: 'warning: large bundle' }],
          },
        ],
        hasMore: false,
      });
    });

    it('filters setup logs when the run failed before any tasks', async () => {
      client.scenario.get(TASK_LOGS_PATH, (_req, res) => {
        res.json({ tasks: [], hasMore: false });
      });
      useAttempt('failed');
      client.scenario.get(
        '/v1/vercel-ci/invocations/:invocationId/attempts/:attempt/logs',
        (_req, res) => {
          res.json({
            lines: [
              { level: 'info', timestamp: 1, message: 'Cloning repository' },
              { level: 'info', timestamp: 2, message: 'Lockfile mismatch' },
            ],
          });
        }
      );

      client.setArgv(
        'ci',
        'logs',
        'abc123',
        '--attempt',
        '1',
        '--failed',
        '--grep',
        'lockfile'
      );
      const exitCode = await ci(client);

      expect(exitCode).toBe(0);
      expect(client.stdout.getFullOutput()).toBe('Lockfile mismatch\n');
    });

    it.each([
      [['--grep', ''], '--grep takes 1 to 256 characters of text.'],
      [
        ['--grep', 'x', '--limit', '5'],
        '--grep searches every task, so --limit does not apply.',
      ],
      [
        ['--grep', 'x', '--task', 'web#build', '--follow'],
        "--grep can't be combined with --follow.",
      ],
    ])('rejects %j', async (flags, message) => {
      client.setArgv('ci', 'logs', 'abc123', ...flags);
      const exitCode = await ci(client);

      expect(exitCode).toBe(2);
      expect(client.stderr.getFullOutput()).toContain(message);
    });
  });

  describe('--follow', () => {
    function useTree(trees: Array<ReturnType<typeof createCiTree>>) {
      let calls = 0;
      client.scenario.get(
        '/v1/vercel-ci/invocations/:invocationId/tree',
        (_req, res) => {
          res.json(trees[Math.min(calls++, trees.length - 1)]);
        }
      );
      return () => calls;
    }

    it('requires exactly one task', async () => {
      client.setArgv('ci', 'logs', 'abc123', '--follow');
      const exitCode = await ci(client);

      expect(exitCode).toBe(2);
      expect(client.stderr.getFullOutput()).toContain(
        '--follow streams 1 task at a time. Pass --task <name>.'
      );
    });

    it('streams a task until the eof line', async () => {
      useTree([createCiTree({ running: true })]);
      let params: Record<string, string> = {};
      client.scenario.get(TASK_RUN_LOGS_PATH, (req, res) => {
        params = req.params;
        writeLines(res, [
          { level: 'info', timestamp: 1, message: 'Running tests' },
          { level: 'eof', timestamp: 2, message: '' },
        ]);
      });

      client.setArgv(
        'ci',
        'logs',
        'abc123',
        '--attempt',
        '1',
        '--task',
        'web#test',
        '--follow'
      );
      const exitCode = await ci(client);

      expect(exitCode).toBe(0);
      expect(params).toMatchObject({
        invocationId: 'invo1_abc123',
        attempt: '1',
        jobDefinitionId: 'jobd1_turbo',
        runAttempt: '1',
        taskDefinitionId: 'tskd1_webtest',
        taskRunAttempt: '1',
      });
      expect(client.stdout.getFullOutput()).toBe('Running tests\n');
      expect(client.stderr.getFullOutput()).toContain(
        'Press Ctrl+C to stop; the run keeps going.'
      );
    });

    it('closes the response immediately after an EOF record even if the server stays open', async () => {
      useTree([createCiTree({ running: true })]);
      let closed!: () => void;
      const responseClosed = new Promise<void>(resolve => {
        closed = resolve;
      });
      client.scenario.get(TASK_RUN_LOGS_PATH, (req, res) => {
        if (req.query.follow !== '1') {
          res.json({
            lines: [{ level: 'info', timestamp: 1, message: 'tail' }],
          });
          return;
        }
        res.on('close', closed);
        res.type('application/stream+json');
        res.write(
          `${JSON.stringify({ level: 'info', timestamp: 1, message: 'tail' })}\n`
        );
        res.write(
          `${JSON.stringify({ level: 'eof', timestamp: 2, message: '' })}\n`
        );
      });
      client.setArgv(
        'ci',
        'logs',
        'abc123',
        '--attempt',
        '1',
        '--task',
        'web#test',
        '--follow'
      );
      expect(await ci(client)).toBe(0);
      await responseClosed;
      expect(client.stdout.getFullOutput()).toBe('tail\n');
      expect(sleep).not.toHaveBeenCalled();
    });

    it('rejects --failed with --follow before resolving a run', async () => {
      client.setArgv(
        'ci',
        'logs',
        'abc123',
        '--failed',
        '--follow',
        '--task',
        'web#test'
      );
      expect(await ci(client)).toBe(2);
      expect(client.stderr.getFullOutput()).toContain(
        "--failed can't be combined with --follow."
      );
    });

    it('polls validated JSON snapshots for later task attempts and preserves older late arrivals', async () => {
      const running = createCiTree({ running: true });
      const completed = createCiTree();
      running.jobs[0].tasks[0].run!.attempt = 2;
      completed.jobs[0].tasks[0].run!.attempt = 2;
      useTree([running, running, running, running, completed]);
      const first = { level: 'info', timestamp: 100, message: 'first' };
      const older = {
        level: 'info',
        timestamp: 1,
        message: 'older late arrival',
      };
      let calls = 0;
      client.scenario.get(TASK_RUN_LOGS_PATH, (req, res) => {
        expect(req.params.taskRunAttempt).toBe('2');
        expect(req.query.since).toBeUndefined();
        calls++;
        // Pretty-printed application/json is also a valid finite snapshot.
        res
          .type('application/json')
          .send(
            JSON.stringify(
              { lines: calls === 1 ? [first] : [older, first, first] },
              null,
              2
            )
          );
      });
      client.setArgv(
        'ci',
        'logs',
        'abc123',
        '--attempt',
        '1',
        '--task',
        'web#test',
        '--follow',
        '--json'
      );
      expect(await ci(client)).toBe(0);
      expect(calls).toBe(5);
      expect(
        client.stdout
          .getFullOutput()
          .trim()
          .split('\n')
          .map(text => JSON.parse(text).message)
      ).toEqual(['first', 'older late arrival', 'first']);
      expect(sleep).toHaveBeenCalledTimes(4);
    });

    it.each([
      false,
      true,
    ])('keeps errors after records valid JSONL (API error=%s)', async apiError => {
      useTree([createCiTree({ running: true })]);
      let calls = 0;
      client.scenario.get(TASK_RUN_LOGS_PATH, (_req, res) => {
        calls++;
        if (apiError && calls === 2) {
          res
            .status(403)
            .json({ error: { code: 'forbidden', message: 'denied' } });
        } else {
          res
            .type('application/stream+json')
            .send(
              `${JSON.stringify({ level: 'info', timestamp: 5, message: 'first' })}\n{invalid}\n`
            );
        }
      });
      client.nonInteractive = true;
      client.setArgv(
        'ci',
        'logs',
        'abc123',
        '--attempt',
        '1',
        '--task',
        'web#test',
        '--follow'
      );
      expect(await ci(client)).toBe(1);
      expect(calls).toBe(apiError ? 2 : 3);
      const records = client.stdout
        .getFullOutput()
        .trim()
        .split('\n')
        .map(text => JSON.parse(text));
      expect(records).toHaveLength(2);
      expect(records[0].message).toBe('first');
      expect(records[1]).toMatchObject({
        status: 'error',
        reason: apiError ? 'permission_denied' : 'api_error',
      });
      expect(client.stderr.getFullOutput()).not.toContain('Streaming logs');
    });

    it('keeps malformed tree errors after records valid JSONL', async () => {
      let calls = 0;
      client.scenario.get(
        '/v1/vercel-ci/invocations/:invocationId/tree',
        (_req, res) => {
          res.json(++calls === 1 ? createCiTree({ running: true }) : null);
        }
      );
      client.scenario.get(TASK_RUN_LOGS_PATH, (_req, res) =>
        writeLines(res, [{ level: 'info', timestamp: 1, message: 'first' }])
      );
      client.setArgv(
        'ci',
        'logs',
        'abc123',
        '--attempt',
        '1',
        '--task',
        'web#test',
        '--follow',
        '--json'
      );
      expect(await ci(client)).toBe(1);
      const records = client.stdout
        .getFullOutput()
        .trim()
        .split('\n')
        .map(text => JSON.parse(text));
      expect(records).toHaveLength(2);
      expect(records[1]).toMatchObject({
        status: 'error',
        reason: 'api_error',
      });
      expect(records[1].message).toContain(
        'Failed to fetch a valid Vercel CI run tree.'
      );
    });

    it.each([
      'bulk',
      'grep',
      'setup',
      'follow',
      'json',
    ])('awaits stdout drain for %s output', async mode => {
      const first = { level: 'info', timestamp: 1, message: 'first' };
      const second = { level: 'info', timestamp: 2, message: 'second' };
      if (mode === 'follow') {
        useTree([createCiTree({ running: true })]);
        client.scenario.get(TASK_RUN_LOGS_PATH, (_req, res) =>
          writeLines(res, [
            first,
            second,
            { level: 'eof', timestamp: 3, message: '' },
          ])
        );
      } else {
        client.scenario.get(TASK_LOGS_PATH, (_req, res) =>
          res.json({
            tasks:
              mode === 'setup'
                ? []
                : [failedTask([{ message: 'first' }, { message: 'second' }])],
            hasMore: false,
          })
        );
        if (mode === 'setup') {
          useAttempt('failed');
          client.scenario.get(
            '/v1/vercel-ci/invocations/:invocationId/attempts/:attempt/logs',
            (_req, res) => res.json({ lines: [first, second] })
          );
        }
      }
      const originalWrite = client.stdout.write.bind(client.stdout);
      let release!: () => void;
      const blocked = new Promise<void>(resolve => {
        release = resolve;
      });
      const write = vi
        .spyOn(client.stdout, 'write')
        .mockImplementationOnce(
          (...args: Parameters<typeof client.stdout.write>) => {
            originalWrite(...args);
            release();
            return false;
          }
        );
      client.setArgv(
        'ci',
        'logs',
        'abc123',
        '--attempt',
        '1',
        ...(mode === 'follow' ? ['--task', 'web#test', '--follow'] : []),
        ...(mode === 'grep' ? ['--grep', 'i'] : []),
        ...(mode === 'setup' ? ['--failed'] : []),
        ...(mode === 'json' ? ['--json'] : [])
      );
      let settled = false;
      const command = ci(client).then(code => {
        settled = true;
        return code;
      });
      try {
        await blocked;
        await new Promise(resolve => setImmediate(resolve));
        expect(settled).toBe(false);
        expect(write).toHaveBeenCalledTimes(1);
        client.stdout.emit('drain');
        expect(await command).toBe(0);
      } finally {
        write.mockRestore();
      }
    });

    it('replays all available records until the task finishes', async () => {
      useTree([
        createCiTree({ running: true }),
        createCiTree({ running: true }),
        createCiTree(),
      ]);
      const sinces: Array<string | undefined> = [];
      client.scenario.get(TASK_RUN_LOGS_PATH, (req, res) => {
        sinces.push(req.query.since as string | undefined);
        writeLines(
          res,
          sinces.length === 1
            ? [{ level: 'info', timestamp: 5, message: 'first' }]
            : [{ level: 'info', timestamp: 9, message: 'second' }]
        );
      });

      client.setArgv(
        'ci',
        'logs',
        'abc123',
        '--attempt',
        '1',
        '--task',
        'web#test',
        '--follow',
        '--format',
        'json'
      );
      const exitCode = await ci(client);

      expect(exitCode).toBe(0);
      expect(sinces).toEqual([undefined, undefined, undefined]);
      expect(
        client.stdout
          .getFullOutput()
          .trim()
          .split('\n')
          .map(line => JSON.parse(line).message)
      ).toEqual(['first', 'second']);
    });

    it.each([
      false,
      true,
    ])('drains late ingestion after completion even with no earlier lines (empty=%s)', async empty => {
      const treeCalls = useTree([
        createCiTree({ running: true }),
        createCiTree(),
      ]);
      const queries: Query[] = [];
      client.scenario.get(TASK_RUN_LOGS_PATH, (req, res) => {
        queries.push(req.query as Query);
        writeLines(
          res,
          queries.length === 1
            ? empty
              ? []
              : [{ level: 'info', timestamp: 5, message: 'first' }]
            : [
                ...(empty
                  ? []
                  : [{ level: 'info', timestamp: 5, message: 'first' }]),
                {
                  level: 'info',
                  timestamp: 5,
                  message: 'late same millisecond',
                },
                { level: 'info', timestamp: 9, message: 'tail' },
              ]
        );
      });
      client.setArgv(
        'ci',
        'logs',
        'abc123',
        '--attempt',
        '1',
        '--task',
        'web#test',
        '--follow'
      );

      expect(await ci(client)).toBe(0);
      expect(treeCalls()).toBe(2);
      expect(queries.map(query => query.follow)).toEqual(['1', undefined]);
      expect(queries.map(query => query.since)).toEqual([undefined, undefined]);
      expect(client.stdout.getFullOutput()).toBe(
        `${empty ? '' : 'first\n'}late same millisecond\ntail\n`
      );
      expect(sleep).toHaveBeenCalledTimes(1);
      expect(sleep).toHaveBeenCalledWith(2000);
    });

    it('reads an already completed task as a full snapshot without follow or since', async () => {
      useTree([createCiTree()]);
      let query: Query = {};
      client.scenario.get(TASK_RUN_LOGS_PATH, (req, res) => {
        query = req.query as Query;
        writeLines(res, [{ level: 'info', timestamp: 5, message: 'all logs' }]);
      });
      client.setArgv(
        'ci',
        'logs',
        'abc123',
        '--attempt',
        '1',
        '--task',
        'web#test',
        '--follow'
      );
      expect(await ci(client)).toBe(0);
      expect(query.follow).toBeUndefined();
      expect(query.since).toBeUndefined();
      expect(client.stdout.getFullOutput()).toBe('all logs\n');
      expect(sleep).not.toHaveBeenCalled();
    });

    it.each([
      false,
      true,
    ])('replays a full snapshot after EOF to recover records skipped inside the stream (json=%s)', async asJson => {
      useTree([createCiTree({ running: true })]);
      const first = { level: 'info', timestamp: 100, message: 'first' };
      const late = {
        level: 'error',
        timestamp: 100,
        message: 'late same millisecond',
      };
      const older = {
        level: 'info',
        timestamp: 1,
        message: 'older late arrival',
      };
      const queries: Query[] = [];
      client.scenario.get(TASK_RUN_LOGS_PATH, (req, res) => {
        queries.push(req.query as Query);
        writeLines(
          res,
          req.query.follow === '1'
            ? [first, { level: 'eof', timestamp: 101, message: '' }]
            : [older, first, late]
        );
      });
      client.setArgv(
        'ci',
        'logs',
        'abc123',
        '--attempt',
        '1',
        '--task',
        'web#test',
        '--follow',
        ...(asJson ? ['--json'] : [])
      );
      expect(await ci(client)).toBe(0);
      expect(queries).toEqual([{ follow: '1' }, {}]);
      const messages = asJson
        ? client.stdout
            .getFullOutput()
            .trim()
            .split('\n')
            .map(line => JSON.parse(line).message)
        : client.stdout.getFullOutput().trim().split('\n');
      expect(messages).toEqual([
        'first',
        'older late arrival',
        'late same millisecond',
      ]);
      expect(sleep).not.toHaveBeenCalled();
    });

    it.each(
      (
        [
          { result: 'succeeded' },
          { result: 'cached' },
          { result: 'skipped', reason: 'dependency_failed' },
          { result: 'failed', reason: 'command_failed' },
        ] satisfies CiTaskConclusion[]
      ).flatMap(taskConclusion =>
        [false, true].map(asJson => ({ taskConclusion, asJson }))
      )
    )('warns about empty retry logs without failing valid empty results ($taskConclusion.result, json=$asJson)', async ({
      taskConclusion,
      asJson,
    }) => {
      const running = createCiTree({ running: true });
      const completed = createCiTree({ taskConclusion });
      running.jobs[0].tasks[0].run!.attempt = 2;
      completed.jobs[0].tasks[0].run!.attempt = 2;
      useTree([running, completed]);
      const queries: Query[] = [];
      client.scenario.get(TASK_RUN_LOGS_PATH, (req, res) => {
        expect(req.params.taskRunAttempt).toBe('2');
        queries.push(req.query as Query);
        res.json({ lines: [] });
      });
      client.nonInteractive = asJson;
      client.setArgv(
        'ci',
        'logs',
        'abc123',
        '--attempt',
        '1',
        '--task',
        'web#test',
        '--follow'
      );
      expect(await ci(client)).toBe(0);
      expect(queries).toEqual([{ follow: '1' }, {}]);
      const stderr = client.stderr.getFullOutput();
      const text = asJson ? JSON.parse(stderr).message : stderr;
      expect(text).toContain('No logs were returned for task attempt 2.');
      expect(text).toContain(
        'Logs may be empty or unavailable for this attempt.'
      );
      expect(client.stdout.getFullOutput()).toBe('');
      if (asJson) {
        expect(JSON.parse(stderr)).toMatchObject({
          type: 'warning',
          reason: 'ci_logs_empty',
        });
        expect(stderr).not.toContain('Streaming logs');
        expect(stderr).not.toContain('\u001b');
      } else {
        expect(stderr).toContain('! No logs were returned');
      }
    });

    it('allows a completed retried task to have no lines matching a level filter', async () => {
      const completed = createCiTree();
      completed.jobs[0].tasks[0].run!.attempt = 2;
      useTree([completed]);
      client.scenario.get(TASK_RUN_LOGS_PATH, (req, res) => {
        expect(req.query).toEqual({ level: 'error' });
        res.json({ lines: [] });
      });
      client.setArgv(
        'ci',
        'logs',
        'abc123',
        '--attempt',
        '1',
        '--task',
        'web#test',
        '--follow',
        '--level',
        'error'
      );
      expect(await ci(client)).toBe(0);
      expect(client.stdout.getFullOutput()).toBe('');
      expect(client.stderr.getFullOutput()).not.toContain(
        'Logs may be unavailable'
      );
    });

    it('preserves distinct same-millisecond lines and identical line multiplicity across replays', async () => {
      useTree([
        createCiTree({ running: true }),
        createCiTree({ running: true }),
        createCiTree(),
      ]);
      const queries: Query[] = [];
      const repeat = { level: 'info', timestamp: 1, message: 'repeat' };
      const other = { level: 'info', timestamp: 1, message: 'other' };
      client.scenario.get(TASK_RUN_LOGS_PATH, (req, res) => {
        queries.push(req.query as Query);
        writeLines(
          res,
          queries.length === 1
            ? [repeat, repeat]
            : queries.length === 2
              ? [repeat, other, repeat, repeat]
              : [
                  repeat,
                  other,
                  repeat,
                  repeat,
                  { ...other, level: 'warn' },
                  { ...other, timestamp: 2, message: 'tail' },
                ]
        );
      });
      client.setArgv(
        'ci',
        'logs',
        'abc123',
        '--attempt',
        '1',
        '--task',
        'web#test',
        '--follow',
        '--json'
      );
      expect(await ci(client)).toBe(0);
      expect(queries.map(query => query.since)).toEqual([
        undefined,
        undefined,
        undefined,
      ]);
      expect(
        client.stdout
          .getFullOutput()
          .trim()
          .split('\n')
          .map(line => {
            const parsed = JSON.parse(line);
            return [parsed.message, parsed.level];
          })
      ).toEqual([
        ['repeat', 'info'],
        ['repeat', 'info'],
        ['other', 'info'],
        ['repeat', 'info'],
        ['other', 'warn'],
        ['tail', 'info'],
      ]);
    });

    it('retries a truncated final snapshot without duplicating earlier stream output', async () => {
      useTree([createCiTree({ running: true }), createCiTree()]);
      const queries: Query[] = [];
      const first = { level: 'info', timestamp: 5, message: 'first' };
      client.scenario.get(TASK_RUN_LOGS_PATH, (req, res) => {
        queries.push(req.query as Query);
        if (queries.length === 1) {
          writeLines(res, [first]);
        } else if (queries.length === 2) {
          res
            .type('application/json')
            .send(`{"lines":[${JSON.stringify(first)}`);
        } else {
          writeLines(res, [
            first,
            { level: 'info', timestamp: 6, message: 'tail' },
          ]);
        }
      });
      client.stdout.isTTY = false;
      client.setArgv(
        'ci',
        'logs',
        'abc123',
        '--attempt',
        '1',
        '--task',
        'web#test',
        '--follow'
      );

      expect(await ci(client)).toBe(0);
      expect(queries.map(query => query.follow)).toEqual([
        '1',
        undefined,
        undefined,
      ]);
      expect(queries.map(query => query.since)).toEqual([
        undefined,
        undefined,
        undefined,
      ]);
      expect(client.stdout.getFullOutput()).toBe('first\ntail\n');
      expect(sleep).toHaveBeenCalledTimes(2);
    });

    it('finishes a pending EOF snapshot before a newer task attempt can replace its locator', async () => {
      const running = createCiTree({ running: true });
      const retry = createCiTree();
      retry.jobs[0].tasks[0].run!.attempt = 2;
      const treeCalls = useTree([running, retry]);
      const first = { level: 'info', timestamp: 5, message: 'first' };
      const tail = { level: 'info', timestamp: 5, message: 'late tail' };
      let calls = 0;
      client.scenario.get(TASK_RUN_LOGS_PATH, (req, res) => {
        expect(req.params.taskRunAttempt).toBe('1');
        calls++;
        if (req.query.follow === '1') {
          writeLines(res, [first, { level: 'eof', timestamp: 6, message: '' }]);
        } else if (calls === 2) {
          res.type('application/json').send('{"lines":[');
        } else {
          writeLines(res, [first, tail]);
        }
      });
      client.setArgv(
        'ci',
        'logs',
        'abc123',
        '--attempt',
        '1',
        '--task',
        'web#test',
        '--follow'
      );
      expect(await ci(client)).toBe(0);
      expect(calls).toBe(3);
      expect(treeCalls()).toBe(1);
      expect(client.stdout.getFullOutput()).toBe('first\nlate tail\n');
      expect(sleep).toHaveBeenCalledExactlyOnceWith(2000);
    });

    it('bounds malformed full-snapshot JSON to three requests without hidden parse retries', async () => {
      useTree([createCiTree()]);
      let calls = 0;
      client.scenario.get(TASK_RUN_LOGS_PATH, (req, res) => {
        expect(req.query.follow).toBeUndefined();
        calls++;
        res.type('application/json').send('{"lines":[');
      });
      client.setArgv(
        'ci',
        'logs',
        'abc123',
        '--attempt',
        '1',
        '--task',
        'web#test',
        '--follow',
        '--json'
      );
      expect(await ci(client)).toBe(1);
      expect(calls).toBe(3);
      expect(sleep).toHaveBeenCalledTimes(2);
      expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
        status: 'error',
        reason: 'api_error',
      });
    });

    it('resets the overlap cursor when the task run attempt changes', async () => {
      const first = createCiTree({ running: true });
      const retry = createCiTree();
      retry.jobs[0].tasks[0].run!.attempt = 2;
      useTree([first, retry]);
      const queries: Query[] = [];
      const attempts: string[] = [];
      client.scenario.get(TASK_RUN_LOGS_PATH, (req, res) => {
        attempts.push(req.params.taskRunAttempt);
        queries.push(req.query as Query);
        writeLines(res, [
          { level: 'info', timestamp: 5, message: 'same output' },
        ]);
      });
      client.setArgv(
        'ci',
        'logs',
        'abc123',
        '--attempt',
        '1',
        '--task',
        'web#test',
        '--follow'
      );
      expect(await ci(client)).toBe(0);
      expect(attempts).toEqual(['1', '2']);
      expect(queries.map(query => query.since)).toEqual([undefined, undefined]);
      expect(client.stdout.getFullOutput()).toBe('same output\nsame output\n');
    });

    it.each([
      false,
      true,
    ])('reconnects healthy stream endings beyond the failure cap (with lines=%s)', async withLines => {
      useTree([
        ...Array.from({ length: 4 }, () => createCiTree({ running: true })),
        createCiTree(),
      ]);
      let calls = 0;
      client.scenario.get(TASK_RUN_LOGS_PATH, (_req, res) => {
        calls++;
        writeLines(
          res,
          withLines
            ? [{ level: 'info', timestamp: calls, message: 'progress' }]
            : []
        );
      });
      client.setArgv(
        'ci',
        'logs',
        'abc123',
        '--attempt',
        '1',
        '--task',
        'web#test',
        '--follow'
      );
      expect(await ci(client)).toBe(0);
      expect(calls).toBe(5);
      expect(sleep).toHaveBeenCalledTimes(4);
      expect(vi.mocked(sleep).mock.calls).toEqual(
        Array.from({ length: 4 }, () => [2000])
      );
      expect(client.stderr.getFullOutput()).not.toContain(
        'Failed to stream task logs'
      );
    });

    it.each([
      { lines: [{ level: 'info', timestamp: 1 }] },
      { level: 'info', timestamp: 1 },
      { level: 'info', timestamp: '1', message: 'bad timestamp' },
      { level: 'info', timestamp: 1e20, message: 'bad date' },
      { level: 'invalid', timestamp: 1, message: 'bad level' },
      null,
    ])('bounds retries for invalid log event %j', async event => {
      useTree([createCiTree()]);
      let calls = 0;
      client.scenario.get(TASK_RUN_LOGS_PATH, (_req, res) => {
        calls++;
        res.json(event);
      });
      client.nonInteractive = true;
      client.setArgv(
        'ci',
        'logs',
        'abc123',
        '--attempt',
        '1',
        '--task',
        'web#test',
        '--follow',
        '--json'
      );
      expect(await ci(client)).toBe(1);
      expect(calls).toBe(3);
      expect(sleep).toHaveBeenCalledTimes(2);
      const result = JSON.parse(client.stdout.getFullOutput());
      expect(result.status).toBe('error');
      expect(result.message).toContain(
        'Failed to stream task logs after 3 interrupted or invalid responses.'
      );
      expect(client.stdout.getFullOutput()).not.toContain('not an event');
    });

    it('bounds retries for malformed JSON', async () => {
      useTree([createCiTree({ running: true })]);
      let calls = 0;
      client.scenario.get(TASK_RUN_LOGS_PATH, (_req, res) => {
        calls++;
        res.type('application/stream+json').send('{invalid}\n');
      });
      client.setArgv(
        'ci',
        'logs',
        'abc123',
        '--attempt',
        '1',
        '--task',
        'web#test',
        '--follow'
      );
      expect(await ci(client)).toBe(1);
      expect(calls).toBe(3);
      expect(sleep).toHaveBeenCalledTimes(2);
      expect(client.stdout.getFullOutput()).toBe('');
    });

    it.each([
      false,
      true,
    ])('sanitizes follow output and labels but preserves JSON (json=%s)', async asJson => {
      const tree = createCiTree({ running: true });
      const name = '\u001b[2Jweb#test\n\u0007';
      tree.jobs[0].tasks[0].definition.name = name;
      useTree([tree]);
      const message =
        '\u001b[31mred\u001b[0m\u001b]8;;https://example.com\u0007link\u001b]8;;\u0007\r\n\u0000';
      client.scenario.get(TASK_RUN_LOGS_PATH, (_req, res) =>
        writeLines(res, [
          { level: 'info', timestamp: 1, message },
          { level: 'eof', timestamp: 2, message: '' },
        ])
      );
      client.setArgv(
        'ci',
        'logs',
        'abc123',
        '--attempt',
        '1',
        '--task',
        name,
        '--follow',
        ...(asJson ? ['--json'] : [])
      );
      expect(await ci(client)).toBe(0);
      if (asJson) {
        expect(JSON.parse(client.stdout.getFullOutput()).message).toBe(message);
        expect(client.stderr.getFullOutput()).not.toContain('Streaming logs');
      } else {
        expect(client.stdout.getFullOutput()).toBe('redlink\\r\\n\\u0000\n');
        expect(client.stderr.getFullOutput()).toContain(
          'Streaming logs for web#test\\n\\u0007.'
        );
        expect(client.stderr.getFullOutput()).not.toContain('\u001b[2J');
      }
    });

    it('fails for an unknown task', async () => {
      useTree([createCiTree({ running: true })]);

      client.setArgv(
        'ci',
        'logs',
        'abc123',
        '--attempt',
        '1',
        '--task',
        'web#missing',
        '--follow'
      );
      const exitCode = await ci(client);

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        "Couldn't find a task with that name in this run."
      );
    });
  });
});
