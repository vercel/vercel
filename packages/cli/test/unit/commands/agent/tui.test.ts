import { ReadableStream } from 'node:stream/web';
import type { ReadableStreamDefaultController } from 'node:stream/web';
import type { Target } from '../../../../src/commands/agent/session';
import type { AgentMessage } from '../../../../src/commands/agent/types';
import { describe, expect, it } from 'vitest';
import { createAgentApi } from '../../../../src/commands/agent/api';
import {
  applyChunk,
  createTurnState,
  parseSse,
} from '../../../../src/commands/agent/stream';
import { ChatApp } from '../../../../src/commands/agent/tui/chat';
import { renderMarkdown } from '../../../../src/commands/agent/tui/markdown';
import {
  renderMessage,
  renderUserPrompt,
} from '../../../../src/commands/agent/tui/message';
import { foldPlan } from '../../../../src/commands/agent/tui/plan';
import {
  formatElapsed,
  spinnerLine,
} from '../../../../src/commands/agent/tui/status';
import {
  char,
  createTestClient,
  fixture,
  key,
  plain,
  sseBody,
  waitFor,
} from './utils';

async function reduced(name: string): Promise<AgentMessage> {
  const state = createTurnState();
  for await (const chunk of parseSse(sseBody(fixture(name))))
    applyChunk(state, chunk);
  return state.message;
}

/** A response body the test feeds by hand, to act while the agent is still working. */
function manualStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start: c => {
      controller = c;
    },
  });
  const encoder = new TextEncoder();
  return {
    body,
    send: (chunk: object) =>
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)),
    close: () => {
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  };
}

const oldSession = {
  id: 'old-1',
  messages: [
    {
      id: 'u',
      role: 'user',
      parts: [{ type: 'text', text: 'Why did the build fail?' }],
    },
    {
      id: 'a',
      role: 'assistant',
      parts: [{ type: 'text', text: 'A missing env var.' }],
    },
  ],
};

function makeChat(
  options: {
    stream?: string | (() => ReadableStream<Uint8Array>);
    history?: AgentMessage[];
    isNew?: boolean;
  } = {}
) {
  const stream = options.stream ?? 'simple-answer.sse';
  const posts: any[] = [];
  const fetch = (async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    if (init.method === 'POST' && init.body) {
      posts.push(JSON.parse(String(init.body)));
      return new Response(
        typeof stream === 'string' ? sseBody(fixture(stream)) : stream()
      );
    }
    if (url.includes('/sessions?')) {
      return Response.json({
        items: [
          {
            id: 'old-1',
            createdAt: 0,
            updatedAt: Date.now() - 3_600_000,
            tags: { title: 'Why did the build fail?' },
          },
        ],
        cursor: null,
      });
    }
    if (url.includes('/sessions/old-1?')) return Response.json(oldSession);
    return Response.json({ success: true });
  }) as typeof globalThis.fetch;
  const { client } = createTestClient({ fetch });
  const target: Target = {
    client,
    api: createAgentApi(client),
    context: {
      team: { id: 'team_1', slug: 'acme' },
      project: { id: 'prj_1', slug: 'site' },
      branch: 'main',
    },
    session: { id: 'sess-1', isNew: options.isNew ?? true },
    url: 'https://vercel.com/acme/~/agent/chat/sess-1',
  };
  let exited = false;
  const app = new ChatApp(
    target,
    {
      render: () => {},
      exit: () => {
        exited = true;
      },
    },
    { history: options.history }
  );
  const frame = (width = 100, height = 40): string =>
    plain(app.view(width, height));
  return {
    app,
    posts,
    frame,
    exited: () => exited,
    type: (text: string) => app.handle(char(text)),
    press: (name: string, mods = {}) => app.handle(key(name, mods)),
    /** Click the row showing `label`. */
    click: (label: string) => {
      const y = frame()
        .split('\n')
        .findIndex(line => line.includes(label));
      app.handle({
        kind: 'mouse',
        action: 'press',
        x: 2,
        y,
      });
    },
  };
}

describe('renderMessage', () => {
  it('collapses thinking and finished tool calls, and shows a pending plan', async () => {
    const text = plain(
      renderMessage(await reduced('plan-approval.sse'), {
        width: 100,
        verbose: false,
      }).lines
    );
    expect(text).toContain('▸ Thought');
    expect(text).not.toContain('Need to redeploy.');
    expect(text).toContain('▸ Bash(vercel inspect --logs) · 1 failed');
    expect(text).toContain('Plan: Redeploy');
    expect(text).toContain('Redeploy production');
  });

  it('shows tool output in verbose mode and marks answers', async () => {
    const text = plain(
      renderMessage(await reduced('simple-answer.sse'), {
        width: 100,
        verbose: true,
      }).lines
    );
    expect(text).toContain('└ 1 result');
    expect(text).toContain('● I can answer Vercel questions');
  });

  it('keeps every line inside the width', () => {
    const message: AgentMessage = {
      id: 'm',
      role: 'assistant',
      parts: [
        {
          type: 'tool-Bash',
          toolCallId: 'b',
          state: 'output-available',
          input: { command: 'ls' },
          output: { exitCode: 0, output: `${'x'.repeat(200)}\nsecond` },
        },
        {
          type: 'text',
          text: 'word '.repeat(40),
        },
      ],
    };
    const lines = plain(
      renderMessage(message, { width: 50, verbose: true }).lines
    ).split('\n');
    expect(Math.max(...lines.map(l => l.length))).toBeLessThanOrEqual(50);
    expect(lines.join('\n')).toContain('…');
    expect(
      plain(renderUserPrompt('word '.repeat(30), 30))
        .split('\n')
        .every(l => l.length <= 30)
    ).toBe(true);
  });
});

describe('plans', () => {
  const plan = {
    title: 'Ship it',
    tasks: [
      { id: 't1', title: 'Add env var' },
      { id: 't2', title: 'Redeploy' },
    ],
  };
  const message: AgentMessage = {
    id: 'm',
    role: 'assistant',
    parts: [
      {
        type: 'tool-ProposePlan',
        toolCallId: 'p',
        state: 'output-available',
        input: plan,
        output: { status: 'active' },
      },
      {
        type: 'tool-UpdatePlanTask',
        toolCallId: 'u1',
        state: 'output-available',
        input: { taskId: 't1', status: 'completed' },
      },
      {
        type: 'tool-UpdatePlanTask',
        toolCallId: 'u2',
        state: 'input-available',
        input: { taskId: 't2', status: 'in_progress' },
      },
      {
        type: 'tool-UpdatePlanTask',
        toolCallId: 'u3',
        state: 'output-error',
        input: { taskId: 't2', status: 'completed' },
      },
      {
        type: 'tool-CompletePlan',
        toolCallId: 'c',
        state: 'output-available',
        input: { summary: 'All done.' },
      },
    ],
  };

  it('follows task updates and ignores failed calls', () => {
    expect(foldPlan(undefined, message.parts.slice(0, 4))).toEqual({
      title: 'Ship it',
      state: 'active',
      tasks: [
        { id: 't1', title: 'Add env var', status: 'completed' },
        { id: 't2', title: 'Redeploy', status: 'in_progress' },
      ],
    });
    expect(foldPlan(undefined, message.parts)?.state).toBe('completed');
    expect(
      foldPlan(undefined, [
        {
          type: 'tool-ProposePlan',
          toolCallId: 'p',
          state: 'output-denied',
          input: plan,
        },
      ])
    ).toBeUndefined();
  });

  it('renders the plan as checklists, without task-update noise', () => {
    const text = plain(
      renderMessage(message, { width: 100, verbose: false }).lines
    );
    expect(text).toContain('● Plan: Ship it');
    expect(text).toContain('● Plan complete');
    expect(text).toContain('✓ Add env var');
    expect(text).toContain('● Redeploy');
    expect(text).toContain('All done.');
    expect(text).not.toContain('UpdatePlanTask');
  });
});

describe('markdown', () => {
  it('keeps snake_case names and renders italics', () => {
    expect(
      plain(
        renderMarkdown(
          'Set VERCEL_AGENT_CLI_TEST=1 _(read-write:env)_ and **bold**',
          100
        )
      )
    ).toBe('Set VERCEL_AGENT_CLI_TEST=1 (read-write:env) and bold');
  });

  it('renders lists, tables, quotes and code', () => {
    const text = [
      '# Status',
      '- **web** is `READY`',
      '  - nested item',
      '1. first',
      '',
      '| Project | State |',
      '| --- | --- |',
      '| **web** | ok |',
      '| api-server | `ERROR` |',
      '',
      '> note this',
      '```',
      'vercel logs',
      '```',
      '---',
    ].join('\n');
    expect(plain(renderMarkdown(text, 100))).toMatchInlineSnapshot(`
      "Status
      • web is READY
        ◦ nested item
      1. first

      Project      State
      ──────────────────
      web          ok
      api-server   ERROR

      ▎ note this
      │ vercel logs
      ────────────────────────────────────────"
    `);
  });

  it('shows link text only in tables and shrinks wide columns to fit', () => {
    const url = `https://antfu-local-test-2hdfjd224.${'x'.repeat(60)}.vercel.app`;
    const text = [
      '| Deployment | State |',
      '| --- | --- |',
      `| [2hdfjd224](${url}) | Error |`,
      `| ${url} | Ready |`,
    ].join('\n');
    const rendered = plain(renderMarkdown(text, 40));
    expect(rendered.split('\n').every(l => l.length <= 40)).toBe(true);
    expect(rendered).toMatch(/^2hdfjd224 +Error$/m);
    expect(rendered).toMatch(/^https:\/\/antfu-local-test-2hdfj.*… +Ready$/m);
  });

  it('wraps long list items under their text', () => {
    expect(
      plain(renderMarkdown('- **Env:** one two three four five six', 16))
    ).toBe('• Env: one two\n  three four\n  five six');
  });
});

describe('status', () => {
  it('formats the spinner with elapsed time', () => {
    expect(formatElapsed(65_000)).toBe('1m 5s');
    expect(
      plain([spinnerLine('Checking the build logs.', 0, 100, 12_000)])
    ).toMatch(/Checking the build logs… {2}12s · esc to interrupt/);
  });
});

describe('chat', () => {
  it('sends a prompt and renders the answer', async () => {
    const chat = makeChat();
    expect(chat.frame()).toMatch(/Project +site/);
    expect(chat.frame()).toMatch(/Branch +main/);
    chat.type('what can you do?');
    chat.press('return');
    await waitFor(() => chat.frame().includes('I can answer Vercel questions'));
    expect(chat.posts[0]).toMatchObject({
      surface: 'dashboard',
      messages: [
        {
          parts: [{ text: 'what can you do?' }],
        },
      ],
    });
    expect(chat.frame()).toContain('▸ KnowledgeSearch(');
  });

  it('adds lines with backslash-enter or Shift+Enter, and recalls prompt history', async () => {
    const chat = makeChat();
    chat.type('first line\\');
    chat.press('return');
    chat.type('second');
    chat.press('return', { shift: true });
    chat.type('third');
    expect(chat.frame()).toMatch(/› first line\s*│\n *│ {3}second/);
    chat.press('return');
    await waitFor(() => chat.posts.length === 1);
    expect(chat.posts[0].messages[0].parts[0].text).toBe(
      'first line\nsecond\nthird'
    );
    await waitFor(() => chat.frame().includes('Ask about your projects'));
    chat.press('up');
    expect(chat.frame()).toContain('› first line');
  });

  it('toggles the shortcuts panel with ? on an empty prompt', () => {
    const chat = makeChat();
    expect(chat.frame()).toContain('? for shortcuts');
    chat.type('?');
    expect(chat.frame()).toContain('prompt history');
  });

  it('filters slash commands and starts a new session with /new', () => {
    const chat = makeChat();
    chat.type('/re');
    expect(chat.frame()).toContain('/resume');
    expect(chat.frame()).not.toContain('/exit');
    chat.press('backspace');
    chat.press('backspace');
    chat.type('n');
    expect(chat.frame()).not.toContain('/resume');
    chat.press('return');
    expect(chat.frame()).not.toContain('sess-1');
    expect(chat.frame()).toMatch(/agent\/chat\/[0-9a-f-]{36}/);
  });

  it('resumes a past session from /resume', async () => {
    const chat = makeChat();
    chat.type('/resume');
    chat.press('return');
    await waitFor(() => chat.frame().includes('Why did the build fail?'));
    expect(chat.frame()).toContain('1h ago');
    chat.press('return');
    await waitFor(() => chat.frame().includes('A missing env var.'));
    expect(chat.frame()).toContain('agent/chat/old-1');
  });

  it('queues messages typed while the agent works', async () => {
    const turns: ReturnType<typeof manualStream>[] = [];
    const chat = makeChat({
      stream: () => {
        const turn = manualStream();
        turns.push(turn);
        return turn.body;
      },
    });
    chat.type('first');
    chat.press('return');
    await waitFor(() => turns.length === 1);
    expect(chat.frame()).toContain('Queue a message');
    chat.type('and also this');
    chat.press('return');
    expect(chat.frame()).toContain('└ Queued: and also this');
    expect(chat.posts).toHaveLength(1);
    turns[0]!.send({ type: 'text-delta', id: 't', delta: 'Done.' });
    turns[0]!.close();
    await waitFor(() => chat.posts.length === 2);
    expect(chat.posts[1].messages[0].parts[0].text).toBe('and also this');
    turns[1]!.close();
  });

  it('lists tool calls while running and collapses them once the agent moves on', async () => {
    const turns: ReturnType<typeof manualStream>[] = [];
    const chat = makeChat({
      stream: () => {
        const turn = manualStream();
        turns.push(turn);
        return turn.body;
      },
    });
    chat.type('go');
    chat.press('return');
    await waitFor(() => turns.length === 1);
    const turn = turns[0]!;
    turn.send({ type: 'start', messageId: 'm1' });
    turn.send({ type: 'reasoning-start', id: 'r' });
    turn.send({ type: 'reasoning-delta', id: 'r', delta: 'secret plan' });
    turn.send({
      type: 'tool-input-available',
      toolCallId: 'a',
      toolName: 'Read',
      input: { path: 'SKILL.md' },
    });
    turn.send({ type: 'tool-output-available', toolCallId: 'a', output: {} });
    turn.send({
      type: 'tool-input-available',
      toolCallId: 'b',
      toolName: 'Bash',
      input: { command: 'vercel ls' },
    });
    await waitFor(() => chat.frame().includes('Bash(vercel ls)'));
    expect(chat.frame()).toMatch(/● Read\(SKILL\.md\)/);
    expect(chat.frame()).toContain('▸ Thought');
    expect(chat.frame()).not.toContain('secret plan');

    turn.send({
      type: 'tool-output-available',
      toolCallId: 'b',
      output: { exitCode: 0, output: 'ok' },
    });
    turn.send({ type: 'text-start', id: 't' });
    turn.send({ type: 'text-delta', id: 't', delta: 'All good.' });
    await waitFor(() => chat.frame().includes('All good.'));
    expect(chat.frame()).toContain('▸ 2 tool calls · Read, Bash');
    expect(chat.frame()).not.toMatch(/● Read/);

    chat.app.handle(char('o', { ctrl: true }));
    expect(chat.frame()).toContain('secret plan');
    expect(chat.frame()).toContain('▾ 2 tool calls');
    turn.close();
  });

  it('expands a collapsed tool group and its thinking on click', () => {
    const chat = makeChat({
      isNew: false,
      history: [
        {
          id: 'u',
          role: 'user',
          parts: [{ type: 'text', text: 'check it' }],
        },
        {
          id: 'a',
          role: 'assistant',
          parts: [
            { type: 'reasoning', text: 'private reasoning' },
            {
              type: 'tool-Read',
              toolCallId: 'r',
              state: 'output-available',
              input: { path: 'a.md' },
              output: {
                metadata: { linesShown: 3 },
              },
            },
            {
              type: 'tool-Bash',
              toolCallId: 'b',
              state: 'output-available',
              input: { command: 'ls' },
              output: { exitCode: 0, output: 'file' },
            },
            { type: 'text', text: 'Fine.' },
          ],
        },
      ],
    });
    chat.click('▸ 2 tool calls');
    expect(chat.frame()).toContain('▾ 2 tool calls');
    expect(chat.frame()).toContain('└ Read 3 lines');
    expect(chat.frame()).not.toContain('private reasoning');
    chat.click('▸ Thought');
    expect(chat.frame()).toContain('private reasoning');
  });

  it('scrolls the transcript and says how much is below', () => {
    const history: AgentMessage[] = Array.from({ length: 30 }, (_, i) => ({
      id: `a${i}`,
      role: 'assistant',
      parts: [{ type: 'text', text: `answer ${i}` }],
    }));
    const chat = makeChat({ isNew: false, history });
    expect(chat.frame(100, 20)).toContain('answer 29');
    chat.press('pageup');
    expect(chat.frame(100, 20)).toMatch(/▾ \d+ more lines below/);
    expect(chat.frame(100, 20)).not.toContain('answer 29');
    chat.app.handle({
      kind: 'mouse',
      action: 'wheel-down',
      x: 0,
      y: 0,
    });
    for (let i = 0; i < 20; i++) {
      chat.app.handle({
        kind: 'mouse',
        action: 'wheel-down',
        x: 0,
        y: 0,
      });
    }
    chat.frame(100, 20);
    expect(chat.frame(100, 20)).toContain('answer 29');
  });

  it('asks for a second Ctrl+C before exiting', () => {
    const chat = makeChat();
    chat.type('draft');
    chat.app.handle(char('c', { ctrl: true }));
    expect(chat.frame()).not.toContain('draft');
    chat.app.handle(char('c', { ctrl: true }));
    expect(chat.frame()).toContain('Press Ctrl+C again to exit');
    expect(chat.exited()).toBe(false);
    chat.app.handle(char('c', { ctrl: true }));
    expect(chat.exited()).toBe(true);
  });

  it('answers a pending plan from a resumed session', async () => {
    const chat = makeChat({
      isNew: false,
      history: [await reduced('plan-approval.sse')],
    });
    expect(chat.frame()).toContain('› 1. Yes, run it');
    chat.press('down');
    expect(chat.frame()).toContain('› 2. No');
    chat.press('return');
    await waitFor(() => chat.posts.length > 0);
    expect(chat.posts[0].surface).toBeUndefined();
    expect(chat.posts[0].messages[0]).toMatchObject({
      role: 'assistant',
      parts: [
        {
          approval: { id: 'approval_1', approved: false },
        },
      ],
    });
    await waitFor(() =>
      chat.frame().includes('Tell Vercel Agent what to do instead')
    );
  });

  it('wraps long prompts and bullet answers inside the screen', () => {
    const long = `${'word '.repeat(30)}TAIL`;
    const chat = makeChat({
      isNew: false,
      history: [
        {
          id: 'u',
          role: 'user',
          parts: [{ type: 'text', text: long }],
        },
        {
          id: 'a',
          role: 'assistant',
          parts: [{ type: 'text', text: `- **Env:** ${long}\n- second` }],
        },
      ],
    });
    const frame = chat.frame();
    expect(frame.split('\n').every(line => line.length <= 100)).toBe(true);
    expect(frame.match(/TAIL/g)).toHaveLength(2);
    expect(frame).toMatch(/• Env: word/);
  });
});
