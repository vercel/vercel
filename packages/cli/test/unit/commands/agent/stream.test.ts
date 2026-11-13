import type { StreamChunk } from '../../../../src/commands/agent/types';
import { describe, expect, it } from 'vitest';
import {
  applyChunk,
  createTurnState,
  finalText,
  findPendingApproval,
  parseSse,
} from '../../../../src/commands/agent/stream';
import { fixture, sseBody } from './utils';

async function reduce(text: string, size?: number) {
  const state = createTurnState();
  const chunks: StreamChunk[] = [];
  for await (const chunk of parseSse(sseBody(text, size))) {
    chunks.push(chunk);
    applyChunk(state, chunk);
  }
  return { state, chunks };
}

describe('parseSse', () => {
  it('accepts CRLF and CR line endings, even split across chunks', async () => {
    for (const eol of ['\r\n', '\r']) {
      const text = `data: {"type":"a"}${eol}${eol}data: {"type":"b"}${eol}${eol}data: [DONE]${eol}${eol}`;
      for (const size of [1, 2, 7]) {
        const { chunks } = await reduce(text, size);
        expect(chunks.map(c => c.type)).toEqual(['a', 'b']);
      }
    }
  });

  it('stops at [DONE] and ignores trailing data', async () => {
    const { chunks } = await reduce(
      'data: {"type":"a"}\n\ndata: [DONE]\n\ndata: {"type":"b"}\n\n'
    );
    expect(chunks.map(c => c.type)).toEqual(['a']);
  });
});

describe('recorded simple answer', () => {
  it('reduces to a final answer after the tool call', async () => {
    const { state } = await reduce(fixture('simple-answer.sse'));
    expect(state.message.id).toBe('msg_answer');
    expect(state.title).toBe('Investigate Vercel deployment configuration');
    expect(state.preamble).toBe('Identifying Vercel Agent capabilities.');
    expect(state.finishReason).toBe('stop');
    expect(state.streaming.size).toBe(0);
    expect(state.message.parts.map(p => p.type)).toEqual([
      'tool-KnowledgeSearch',
      'text',
    ]);
    expect(state.message.parts[0]).toMatchObject({
      state: 'output-available',
      input: { numResults: 1 },
    });
    expect(finalText(state.message)).toMatchInlineSnapshot(
      `"I can answer Vercel questions, investigate deployment failures, runtime errors, costs and performance, review linked code, and make approved changes within your permissions ([details](https://vercel.com/docs/agent/chat))."`
    );
  });
});

describe('plan approval', () => {
  it('tracks reasoning, tool errors and the pending approval', async () => {
    const { state } = await reduce(fixture('plan-approval.sse'));
    expect(
      state.message.parts.map(p => [p.type, 'state' in p ? p.state : undefined])
    ).toEqual([
      ['reasoning', undefined],
      ['text', undefined],
      ['tool-Bash', 'output-error'],
      ['tool-ProposePlan', 'approval-requested'],
    ]);
    expect(finalText(state.message)).toBe('Let me check the build logs.');

    const pending = findPendingApproval([state.message]);
    expect(pending?.messageId).toBe('msg_plan');
    expect(pending?.part.approval).toEqual({ id: 'approval_1' });
    expect(pending?.plan.title).toBe('Redeploy');
  });

  it('finds nothing once the plan is answered', () => {
    expect(
      findPendingApproval([
        {
          id: 'm',
          role: 'assistant',
          parts: [
            {
              type: 'tool-ProposePlan',
              toolCallId: 'c',
              state: 'output-available',
            },
          ],
        },
      ])
    ).toBeUndefined();
  });
});
