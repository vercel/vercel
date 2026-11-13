import type {
  AgentMessage,
  MessagePart,
} from '../../../../src/commands/agent/types';
import { describe, expect, it } from 'vitest';
import {
  summarizeGroup,
  toBlocks,
} from '../../../../src/commands/agent/tui/blocks';

function tool(
  name: string,
  state = 'output-available',
  input: unknown = {}
): MessagePart {
  return {
    type: `tool-${name}`,
    toolCallId: `${name}-${Math.random()}`,
    state,
    input,
  } as MessagePart;
}
const msg = (...parts: MessagePart[]): AgentMessage => ({
  id: 'm',
  role: 'assistant',
  parts,
});

describe('toBlocks', () => {
  it('groups consecutive tool calls between text and thinking', () => {
    const blocks = toBlocks(
      msg(
        { type: 'reasoning', text: 'hmm' },
        tool('Read'),
        tool('Bash'),
        { type: 'text', text: 'Checking more.' },
        tool('Bash'),
        { type: 'text', text: 'Done.' }
      ),
      false
    );
    expect(
      blocks.map(b => [b.kind, b.kind === 'tools' ? b.parts.length : undefined])
    ).toEqual([
      ['thinking', undefined],
      ['tools', 2],
      ['text', undefined],
      ['tools', 1],
      ['text', undefined],
    ]);
    expect(blocks.some(b => 'active' in b && b.active)).toBe(false);
  });

  it('keeps only the last block active while live', () => {
    const blocks = toBlocks(
      msg(
        tool('Read'),
        { type: 'text', text: 'x' },
        tool('Bash', 'input-available')
      ),
      true
    );
    expect(blocks.map(b => 'active' in b && b.active)).toEqual([
      false,
      false,
      true,
    ]);
    expect(
      toBlocks(msg(tool('Read'), { type: 'text', text: 'x' }), true).map(
        b => 'active' in b && b.active
      )
    ).toEqual([false, false]);
  });

  it('splits plan milestones and approvals out of tool groups', () => {
    const plan = {
      title: 'P',
      tasks: [{ id: 't', title: 'T' }],
    };
    const blocks = toBlocks(
      msg(
        tool('ProposePlan', 'output-available', plan),
        tool('Bash'),
        tool('UpdatePlanTask', 'output-available', {
          taskId: 't',
          status: 'completed',
        }),
        tool('CompletePlan', 'output-available', { summary: 'ok' }),
        tool('ProposePlan', 'approval-requested', plan)
      ),
      false
    );
    expect(blocks.map(b => b.kind)).toEqual([
      'plan',
      'tools',
      'plan',
      'approval',
    ]);
    expect(blocks[1]?.kind === 'tools' && blocks[1].parts.length).toBe(1);
    const done = blocks[2];
    expect(done?.kind === 'plan' && done.plan.state).toBe('completed');
  });
});

describe('summarizeGroup', () => {
  it('counts calls by name and failures', () => {
    const parts = [
      tool('Read'),
      tool('Bash'),
      tool('Bash', 'output-error'),
      tool('Bash'),
    ] as any;
    expect(summarizeGroup(parts)).toEqual({
      label: '4 tool calls',
      names: 'Read, Bash ×3',
      failed: 1,
    });
    expect(summarizeGroup([tool('Read')] as any).label).toBe('1 tool call');
  });
});
