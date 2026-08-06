import stripAnsi from 'strip-ansi';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import output from '../../../../src/output-manager';
import {
  printStint,
  summarizeStint,
  type StintMessage,
} from '../../../../src/commands/ship/replay-stint';

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
  { role: 'user', parts: [{ type: 'tool-result', toolName: 'bash' }] },
  { role: 'user', parts: [{ type: 'tool-result', isError: true }] },
];

describe('printStint', () => {
  let written: string[];

  beforeEach(() => {
    written = [];
    vi.spyOn(output, 'print').mockImplementation((str: string) => {
      written.push(str);
    });
    vi.spyOn(output, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const all = () => stripAnsi(written.join(''));

  it('renders the stint through the live pipeline, attributed', () => {
    printStint(STINT, { harnessId: 'claude-code' });

    const text = all();
    expect(text).toMatch(/you\s+make the api dockerfile/);
    expect(text).toMatch(/claude\s+I'll restructure/);
    expect(text).toMatch(/ran\s+vercel build/);
    expect(text).toMatch(/edited\s+api\/Dockerfile/);
  });

  it('marks the failed call with the renderer, not a bespoke line', () => {
    printStint(STINT, { harnessId: 'claude-code' });
    expect(all()).toMatch(/failed/);
  });

  it('does not fabricate durations for instant replays', () => {
    printStint(STINT, { harnessId: 'claude-code' });
    expect(all()).not.toMatch(/\btook\b/);
  });

  it('keeps the tail of an oversized stint, and says so', () => {
    const long: StintMessage[] = Array.from({ length: 120 }, (_, i) => ({
      role: 'assistant' as const,
      parts: [{ type: 'text', text: `line ${i}` }],
    }));

    printStint(long, { harnessId: 'claude-code' });
    const text = all();
    expect(text).toMatch(/40 earlier exchanges/);
    expect(text).not.toMatch(/\bline 39\b/);
    expect(text).toMatch(/line 119/);
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
