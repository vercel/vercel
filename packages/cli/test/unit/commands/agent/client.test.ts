import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAgentApi } from '../../../../src/commands/agent/api';
import { toUserContext } from '../../../../src/commands/agent/context';
import { toAgentError } from '../../../../src/commands/agent/errors';
import { resolveTarget } from '../../../../src/commands/agent/session';
import { runTurn } from '../../../../src/commands/agent/turn';
import { createTestClient, fixture, json, mockFetch, sseBody } from './utils';

function sse(name: string) {
  return (): Response =>
    new Response(sseBody(fixture(name)), {
      headers: { 'content-type': 'text/event-stream' },
    });
}

describe('toAgentError', () => {
  it('maps API errors to agent-output reasons', async () => {
    const cases: [number, unknown, string][] = [
      [
        401,
        {
          error: { message: 'nope' },
        },
        'login_required',
      ],
      [
        403,
        {
          error: { message: 'Not authorized', invalidToken: true },
        },
        'login_required',
      ],
      [402, { error: 'Upgrade' }, 'payment_required'],
      [
        403,
        { error: 'Vercel Agent is disabled by a Team Admin' },
        'scope_not_accessible',
      ],
      [500, 'boom', 'api_error'],
    ];
    for (const [status, body, reason] of cases) {
      const { fetch } = mockFetch({
        GET: json(body, status),
      });
      const { client } = createTestClient({ fetch });
      const error = await client.fetch('/x').catch(toAgentError);
      expect(error).toMatchObject({ reason });
    }
  });
});

describe('resolveTarget', () => {
  function linkedDir(content: Record<string, unknown>) {
    const root = mkdtempSync(join(tmpdir(), 'vercel-agent-'));
    mkdirSync(join(root, '.vercel'));
    writeFileSync(
      join(root, '.vercel', 'project.json'),
      JSON.stringify(content)
    );
    return root;
  }

  const routes = {
    'GET https://api.vercel.com/teams/team_1': json({
      id: 'team_1',
      slug: 'acme',
    }),
    'GET https://api.vercel.com/teams/team_2': json({
      id: 'team_2',
      slug: 'other',
    }),
    'GET https://api.vercel.com/v9/projects/prj_1': json({
      id: 'prj_1',
      name: 'site',
      accountId: 'team_1',
    }),
  };

  it('uses the linked project only when it belongs to the team', async () => {
    const cwd = linkedDir({ orgId: 'team_1', projectId: 'prj_1' });
    const { fetch } = mockFetch(routes);
    const target = await resolveTarget(
      createTestClient({ fetch, cwd }).client,
      {}
    );
    expect(target.context).toMatchObject({
      team: { id: 'team_1', slug: 'acme' },
      project: { id: 'prj_1', slug: 'site' },
    });
    expect(toUserContext(target.context)).toMatchObject({
      scope: 'acme',
      pathname: '/acme/site',
      params: { project: 'site' },
    });

    const elsewhere = createTestClient({
      fetch: mockFetch(routes).fetch,
      cwd,
      currentTeam: 'team_2',
      argv: ['--scope', 'team_2'],
    }).client;
    const other = await resolveTarget(elsewhere, {});
    expect(other.context.team.slug).toBe('other');
    expect(other.context.project).toBeUndefined();
  });
});

describe('runTurn', () => {
  it('creates the session with its first message', async () => {
    const { fetch, calls } = mockFetch({
      POST: sse('simple-answer.sse'),
    });
    const api = createAgentApi(createTestClient({ fetch }).client);
    const result = await runTurn({
      api,
      teamId: 'team_1',
      sessionId: 'sess-1',
      isNew: true,
      input: { text: 'hi' },
      userContext: { scope: 'acme' },
    });
    expect(result.status).toBe('done');
    expect(calls[0]!.url).toBe(
      'https://vercel.com/api/omniagent/sessions/sess-1?teamId=team_1'
    );
    expect(calls[0]!.headers.get('authorization')).toBe('Bearer tok');
    expect(calls[0]!.body).toMatchObject({
      type: 'message',
      teamId: 'team_1',
      planMode: true,
      surface: 'dashboard',
      userContext: '{"scope":"acme"}',
      messages: [
        {
          role: 'user',
          parts: [{ type: 'text', text: 'hi' }],
        },
      ],
    });
  });

  it('continues the plan message after a decision', async () => {
    const { fetch } = mockFetch({
      POST: sse('plan-continuation.sse'),
    });
    const approval = {
      messageId: 'msg_plan',
      part: {
        type: 'tool-ProposePlan' as const,
        toolCallId: 'call_plan',
        state: 'approval-requested' as const,
        approval: { id: 'a' },
      },
      plan: { title: 'P', tasks: [] },
    };
    const api = createAgentApi(createTestClient({ fetch }).client);
    const result = await runTurn({
      api,
      teamId: 'team_1',
      sessionId: 's',
      isNew: false,
      input: { approval, approved: true },
    });
    expect(result.status).toBe('done');
    expect(
      result.state.message.parts.map(p => [
        p.type,
        'state' in p ? p.state : undefined,
      ])
    ).toEqual([
      ['tool-ProposePlan', 'output-available'],
      ['tool-UpdatePlanTask', 'input-streaming'],
      ['text', undefined],
    ]);
    expect(approval.part.state).toBe('approval-requested');
  });

  it('reports a pending plan and answers it as an assistant message', async () => {
    const { fetch, calls } = mockFetch({
      POST: sse('plan-approval.sse'),
    });
    const api = createAgentApi(createTestClient({ fetch }).client);
    const first = await runTurn({
      api,
      teamId: 'team_1',
      sessionId: 's',
      isNew: false,
      input: { text: 'redeploy' },
    });
    expect(first.status).toBe('approval-required');
    expect(calls[0]!.body.surface).toBeUndefined();

    await runTurn({
      api,
      teamId: 'team_1',
      sessionId: 's',
      isNew: false,
      input: { approval: first.pending!, approved: false },
    });
    expect(calls[1]!.body.messages).toEqual([
      {
        id: 'msg_plan',
        role: 'assistant',
        parts: [
          {
            type: 'tool-ProposePlan',
            toolCallId: 'call_plan',
            state: 'approval-responded',
            input: first.pending!.plan,
            approval: { id: 'approval_1', approved: false },
          },
        ],
      },
    ]);
  });
});
