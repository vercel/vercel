import type { ToolPart } from '../../../../src/commands/agent/types';
import { describe, expect, it } from 'vitest';
import { toolResultLines } from '../../../../src/commands/agent/tui/tool-summary';

function tool(
  name: string,
  output: unknown,
  state: ToolPart['state'] = 'output-available'
): ToolPart {
  return {
    type: `tool-${name}`,
    toolCallId: 'c',
    state,
    output,
  };
}

describe('toolResultLines', () => {
  it('previews Bash output and flags failures', () => {
    const output = { output: 'a\nb\n\nc\nd', stderr: '', exitCode: 0 };
    expect(toolResultLines(tool('Bash', output), false)).toEqual([
      'a',
      'b',
      '… +2 lines',
    ]);
    expect(toolResultLines(tool('Bash', output), true)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
    expect(
      toolResultLines(
        tool('Bash', { output: '', stderr: 'boom', exitCode: 2 }),
        false
      )
    ).toEqual(['Exit code 2', 'boom']);
    expect(
      toolResultLines(tool('Bash', { output: '', exitCode: 0 }), false)
    ).toEqual(['(no output)']);
  });

  it('summarizes Read, Grep and search results', () => {
    expect(
      toolResultLines(
        tool('Read', {
          metadata: { linesShown: 52 },
          content: 'x',
        }),
        false
      )
    ).toEqual(['Read 52 lines']);
    expect(
      toolResultLines(
        tool('Grep', {
          summary: { matchCount: 1, fileCount: 2 },
        }),
        false
      )
    ).toEqual(['1 match in 2 files']);
    expect(
      toolResultLines(
        tool('Grep', {
          summary: { matchCount: 6, fileCount: 1 },
        }),
        false
      )
    ).toEqual(['6 matches in 1 file']);
    expect(
      toolResultLines(
        tool('KnowledgeSearch', {
          results: [{ title: 'Chat' }],
        }),
        true
      )
    ).toEqual(['1 result', 'Chat']);
  });

  it('handles errors, denials and running calls', () => {
    expect(
      toolResultLines(
        {
          ...tool('Bash', undefined, 'output-error'),
          errorText: 'bad\nworse',
        },
        false
      )
    ).toEqual(['bad', '… +1 lines']);
    expect(
      toolResultLines(tool('ProposePlan', undefined, 'output-denied'), false)
    ).toEqual(['Denied']);
    expect(
      toolResultLines(tool('Bash', undefined, 'input-available'), false)
    ).toEqual([]);
  });

  it('shows unknown outputs as JSON only when expanded', () => {
    expect(toolResultLines(tool('Other', { ok: true }), false)).toEqual([]);
    expect(toolResultLines(tool('Other', { ok: true }), true)).toEqual([
      '{',
      '  "ok": true',
      '}',
    ]);
  });
});
