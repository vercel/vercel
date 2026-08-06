import { describe, expect, it } from 'vitest';
import {
  formatStint,
  summarizeStint,
  type StintMessage,
} from '../../../../src/commands/ship/replay-stint';

/** ANSI-stripped, for assertions about words rather than styling. */
function plain(lines: string[]): string[] {
  // eslint-disable-next-line no-control-regex
  return lines.map(line => line.replace(/\x1b\[[0-9;]*m/g, ''));
}

const STINT: StintMessage[] = [
  {
    role: 'user',
    parts: [{ type: 'text', text: 'make the api dockerfile use uv properly' }],
  },
  {
    role: 'assistant',
    parts: [{ type: 'text', text: "I'll restructure it to use `uv sync`." }],
  },
  {
    role: 'assistant',
    parts: [
      {
        type: 'tool-call',
        toolName: 'bash',
        input: { command: 'vercel build' },
      },
      {
        type: 'tool-call',
        toolName: 'edit',
        input: { file_path: 'api/Dockerfile' },
      },
    ],
  },
  {
    role: 'user',
    parts: [{ type: 'tool-result', toolName: 'bash' }],
  },
];

describe('formatStint', () => {
  it('attributes each line to its actor', () => {
    const lines = plain(formatStint(STINT, { harnessId: 'claude-code' }));

    expect(lines[0]).toMatch(/\byou\b.*make the api dockerfile/);
    expect(lines.some(l => /\bclaude\b.*restructure/.test(l))).toBe(true);
    expect(lines.some(l => /\bran\b.*vercel build/.test(l))).toBe(true);
    expect(lines.some(l => /\bedited\b.*api\/Dockerfile/.test(l))).toBe(true);
  });

  it('renders nothing for successful tool results', () => {
    const lines = plain(formatStint(STINT, { harnessId: 'claude-code' }));
    // Four content parts render; the bare tool-result does not.
    expect(lines.filter(l => l.trim()).length).toBe(4);
  });

  it('marks failed tool results', () => {
    const lines = plain(
      formatStint(
        [{ role: 'user', parts: [{ type: 'tool-result', isError: true }] }],
        { harnessId: 'claude-code' }
      )
    );
    expect(lines.some(l => /failed/.test(l))).toBe(true);
  });

  it('keeps the tail of an oversized stint, and says so', () => {
    const long: StintMessage[] = Array.from({ length: 300 }, (_, i) => ({
      role: 'assistant' as const,
      parts: [{ type: 'text', text: `line ${i}` }],
    }));

    const lines = plain(formatStint(long, { harnessId: 'claude-code' }));
    expect(lines.length).toBe(161); // cap + the omission notice
    expect(lines[0]).toMatch(/earlier lines/);
    expect(lines[lines.length - 1]).toMatch(/line 299/);
  });
});

describe('summarizeStint', () => {
  it('counts what the stint contained', () => {
    expect(summarizeStint(STINT)).toEqual({
      userMessages: 1,
      agentReplies: 1,
      toolCalls: 2,
    });
  });
});
