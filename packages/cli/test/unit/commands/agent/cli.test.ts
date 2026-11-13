import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import agent from '../../../../src/commands/agent';
import { createTestClient, fixture, json, mockFetch, sseBody } from './utils';

const pendingPlan = {
  id: 'msg_plan',
  role: 'assistant',
  parts: [
    {
      type: 'tool-ProposePlan',
      toolCallId: 'call_plan',
      state: 'approval-requested',
      input: { title: 'Redeploy', tasks: [] },
      approval: { id: 'approval_1' },
    },
  ],
};

function setup(
  options: {
    messages?: unknown[];
    stream?: string;
    cwd?: string;
    stdin?: string;
    nonInteractive?: boolean;
  } = {}
) {
  const { calls, fetch } = mockFetch({
    'GET https://api.vercel.com/teams/team_1': json({
      id: 'team_1',
      slug: 'acme',
    }),
    'GET https://vercel.com/api/omniagent/sessions?': json({
      items: [
        {
          id: 'latest',
          createdAt: 0,
          updatedAt: 0,
          tags: {},
        },
      ],
      cursor: null,
    }),
    'GET https://vercel.com/api/omniagent/sessions/': json({
      id: 's',
      messages: options.messages ?? [],
      resumable: true,
      canSend: true,
      readOnly: false,
    }),
    'POST https://vercel.com/api/omniagent/sessions/': () =>
      new Response(sseBody(fixture(options.stream ?? 'simple-answer.sse'))),
  });
  return {
    calls,
    run: async (...argv: string[]) => {
      const { client, out } = createTestClient({
        argv,
        fetch,
        cwd: options.cwd,
        stdin: options.stdin,
        tty: false,
        nonInteractive: options.nonInteractive,
      });
      const code = await agent(client);
      return { code, ...out };
    },
  };
}

beforeEach(() => {
  vi.stubEnv(
    'XDG_CACHE_HOME',
    mkdtempSync(join(tmpdir(), 'vercel-agent-state-'))
  );
});

describe('vercel agent "<prompt>"', () => {
  it('prints only the final answer on stdout', async () => {
    const t = setup();
    const r = await t.run('what can you do?');
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^I can answer Vercel questions.*\n$/);
    expect(r.stderr).toContain('▲ Vercel Agent · acme');
    expect(r.stderr).toContain('https://vercel.com/acme/~/agent/chat/');
    expect(r.stderr).toContain('· Identifying Vercel Agent capabilities.');
    expect(r.stderr).toContain('● KnowledgeSearch(What can Vercel Agent do');
    expect(r.stderr).toMatch(/─{48}\n$/);
    const post = t.calls.find(c => c.method === 'POST')!;
    expect(post.url).toMatch(/\/sessions\/[0-9a-f-]+\?teamId=team_1$/);
    expect(post.body.userContext).toContain('"scope":"acme"');
  });

  it('reads the prompt from stdin', async () => {
    const t = setup({ stdin: 'piped question\n' });
    expect((await t.run()).code).toBe(0);
    expect(
      t.calls.find(c => c.method === 'POST')!.body.messages[0].parts[0].text
    ).toBe('piped question');
  });

  it('asks for approval, then answers the plan with --approve', async () => {
    const first = await setup({ stream: 'plan-approval.sse' }).run('redeploy');
    expect(first.code).toBe(1);
    expect(first.stdout).toContain('## Plan: Redeploy');
    expect(first.stderr).toMatch(/vercel agent --session \S+ --approve/);

    const t = setup({
      messages: [pendingPlan],
    });
    expect((await t.run('--continue', '--approve')).code).toBe(0);
    const post = t.calls.find(c => c.method === 'POST')!;
    expect(post.url).toContain('/sessions/latest?teamId=team_1');
    expect(post.body.messages[0]).toMatchObject({
      id: 'msg_plan',
      role: 'assistant',
      parts: [
        {
          state: 'approval-responded',
          approval: { id: 'approval_1', approved: true },
        },
      ],
    });
  });

  it('reports a pending plan as action_required for agents', async () => {
    const r = await setup({
      stream: 'plan-approval.sse',
      nonInteractive: true,
    }).run('redeploy');
    expect(r.code).toBe(1);
    const payload = JSON.parse(r.stdout);
    expect(payload).toMatchObject({
      status: 'action_required',
      reason: 'confirmation_required',
      userActionRequired: true,
      data: {
        plan: { title: 'Redeploy' },
      },
      hint: expect.stringContaining('next[]'),
    });
    expect(payload.next.map((n: { command: string }) => n.command)).toEqual([
      expect.stringMatching(/^vercel agent --session \S+ --approve$/),
      expect.stringMatching(/^vercel agent --session \S+ --reject$/),
    ]);
  });

  it('prints a JSON result with --json or --format json', async () => {
    for (const flag of [['--json'], ['--format', 'json']]) {
      const r = await setup().run(...flag, 'hi');
      expect(r.code).toBe(0);
      expect(JSON.parse(r.stdout)).toMatchObject({
        status: 'ok',
        title: 'Investigate Vercel deployment configuration',
        toolCalls: [{ name: 'KnowledgeSearch', state: 'output-available' }],
      });
      expect(r.stderr).not.toContain('●');
    }
    const bad = await setup().run('--format', 'yaml', 'hi');
    expect(bad.code).toBe(2);
    expect(bad.stderr).toContain('Invalid output format');
  });

  it('prints NDJSON events with --stream', async () => {
    const lines = (await setup().run('--stream', 'hi')).stdout
      .trim()
      .split('\n')
      .map(l => JSON.parse(l));
    expect(lines[0]).toMatchObject({ type: 'session' });
    expect(lines.at(-1)).toEqual({ type: 'finish', finishReason: 'stop' });
  });

  it('rejects bad arguments with usage exit codes and agent payloads', async () => {
    const conflict = await setup().run('--json', '--stream', 'hi');
    expect(conflict.code).toBe(2);
    expect(JSON.parse(conflict.stdout)).toMatchObject({
      status: 'error',
      reason: 'invalid_arguments',
    });

    const missing = await setup().run();
    expect(missing.code).toBe(2);
    expect(missing.stderr).toContain('Missing prompt.');

    const nothing = await setup().run('--session', 'x', '--approve');
    expect(nothing.code).toBe(1);
    expect(nothing.stderr).toContain('No plan is waiting for approval');
  });

  it('continues the last session within 30 minutes unless --new', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'vercel-agent-'));
    const first = setup({ cwd });
    await first.run('first');
    const firstUrl = first.calls.find(c => c.method === 'POST')!.url;

    const second = setup({ cwd });
    const r = await second.run('second');
    const post = second.calls.find(c => c.method === 'POST')!;
    expect(post.url).toBe(firstUrl);
    expect(post.body.surface).toBeUndefined();
    expect(r.stderr).toMatch(
      /\(resumed, last used just now · --new for a fresh session\)/
    );

    const third = setup({ cwd });
    const fresh = await third.run('--new', 'third');
    expect(third.calls.find(c => c.method === 'POST')!.url).not.toBe(firstUrl);
    expect(fresh.stderr).not.toContain('resumed');
  });
});

describe('vercel agent', () => {
  it('lists init and the session options in help', async () => {
    const help = await setup().run('--help');
    expect(help.code).toBe(0);
    expect(help.stderr).toContain('▲ vercel agent [prompt] [options]');
    expect(help.stderr).toContain('init');
    expect(help.stderr).toContain('--session <ID>');
  });

  it('maps Vercel Agent errors to reasons', async () => {
    const { fetch } = mockFetch({
      'GET https://api.vercel.com/teams/team_1': json({
        id: 'team_1',
        slug: 'acme',
      }),
      'POST https://vercel.com/api/omniagent/sessions/': json(
        { error: 'Upgrade' },
        402
      ),
    });
    const { client, out } = createTestClient({
      argv: ['--json', 'hi'],
      fetch,
      tty: false,
    });
    expect(await agent(client)).toBe(1);
    expect(JSON.parse(out.stdout)).toMatchObject({
      status: 'error',
      reason: 'payment_required',
      message: expect.stringContaining('Pro or Enterprise'),
    });
  });
});
