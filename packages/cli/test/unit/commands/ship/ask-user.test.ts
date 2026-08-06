import { afterEach, describe, expect, it, vi } from 'vitest';
import stripAnsi from 'strip-ansi';
import { answerAskUser } from '../../../../src/commands/ship/ask-user';
import { GUTTER_WIDTH } from '../../../../src/commands/ship/voice';
import output from '../../../../src/output-manager';

interface Captured {
  message?: string;
  choices?: { name: string; value: string }[];
  theme?: { prefix?: string };
}

/**
 * Stand in for the prompt, capturing what it was asked to render.
 *
 * The prompt writes `${prefix} ${message}`, so the question lands in the shared
 * text column when the prefix is one character short of the gutter. Choices are
 * drawn with a two-column cursor in front, so their text lands there when they
 * carry the rest of the gutter as indent.
 */
function fakeClient(captured: Captured, options: { isTTY?: boolean } = {}) {
  return {
    stdin: { isTTY: options.isTTY ?? true },
    input: {
      select: async (opts: Captured) => {
        Object.assign(captured, opts);
        return captured.choices?.[0]?.value ?? '';
      },
      checkbox: async (opts: Captured) => {
        Object.assign(captured, opts);
        return [captured.choices?.[0]?.value ?? ''];
      },
      text: async (opts: Captured) => {
        Object.assign(captured, opts);
        return 'typed answer';
      },
    },
  } as never;
}

const QUESTION = {
  question: 'Which team should this deploy into?',
  options: [
    { label: 'vercel-internal-playground', description: 'shared team' },
    { label: 'georgefahmy-8321s-projects' },
  ],
};

describe('ship askUser rendering', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('puts the question in the shared text column', async () => {
    const captured: Captured = {};
    await answerAskUser(fakeClient(captured), QUESTION, 'claude');

    // The prompt adds one space of its own between prefix and message.
    const prefix = stripAnsi(captured.theme?.prefix ?? '');
    expect(prefix).toBe('  claude ');
    expect(prefix.length + 1).toBe(GUTTER_WIDTH);
    expect(captured.message).toBe(QUESTION.question);
  });

  it('puts every choice in the same column as the question', async () => {
    const captured: Captured = {};
    await answerAskUser(fakeClient(captured), QUESTION, 'claude');

    for (const choice of captured.choices ?? []) {
      const name = stripAnsi(choice.name);
      // Two columns are taken by the cursor the prompt draws in front.
      expect(name.startsWith(' '.repeat(GUTTER_WIDTH - 2))).toBe(true);
      expect(name.trimStart().length).toBeGreaterThan(0);
    }
  });

  it('names the harness that asked', async () => {
    const captured: Captured = {};
    await answerAskUser(fakeClient(captured), QUESTION, 'codex');

    expect(stripAnsi(captured.theme?.prefix ?? '')).toBe('   codex ');
  });

  it('offers a free-text choice alongside the options', async () => {
    const captured: Captured = {};
    await answerAskUser(fakeClient(captured), QUESTION, 'claude');

    expect(captured.choices).toHaveLength(QUESTION.options.length + 1);
  });

  it('prints a question too long for the prompt line above it instead', async () => {
    const printed: string[] = [];
    vi.spyOn(output, 'print').mockImplementation((value: string) => {
      printed.push(value);
    });

    const captured: Captured = {};
    const question = `Which of these ${'very '.repeat(40)}teams?`;
    await answerAskUser(
      fakeClient(captured),
      { ...QUESTION, question },
      'claude'
    );

    // Wrapped into the text column rather than overflowing the prompt line.
    const lines = printed.join('').split('\n').filter(Boolean);
    const wrapped = lines.filter(line => stripAnsi(line).trim() !== '');
    expect(wrapped.length).toBeGreaterThan(1);
    expect(stripAnsi(wrapped[0]).startsWith('  claude  ')).toBe(true);
    for (const line of wrapped.slice(1)) {
      expect(line.startsWith(' '.repeat(GUTTER_WIDTH))).toBe(true);
    }
    expect(captured.message).toBe('Choose one');
  });

  it('attributes the question when there is no terminal to ask in', async () => {
    const printed: string[] = [];
    vi.spyOn(output, 'print').mockImplementation((value: string) => {
      printed.push(value);
    });
    vi.spyOn(output, 'warn').mockImplementation(() => {});

    const captured: Captured = {};
    const result = await answerAskUser(
      fakeClient(captured, { isTTY: false }),
      QUESTION,
      'claude'
    );

    expect(stripAnsi(printed.join(''))).toContain(
      `  claude  ${QUESTION.question}`
    );
    expect(result.answer).toContain('No interactive terminal');
  });

  it('keeps the gutter on the free-text follow-up', async () => {
    const captured: Captured = {};
    const client = fakeClient(captured);
    // Choosing the free-text option is what triggers the follow-up prompt.
    (client as unknown as { input: { select: unknown } }).input.select = async (
      opts: Captured
    ) => {
      Object.assign(captured, opts);
      return captured.choices?.at(-1)?.value ?? '';
    };

    const result = await answerAskUser(client, QUESTION, 'claude');

    expect(result.answer).toBe('typed answer');
    expect(stripAnsi(captured.theme?.prefix ?? '')).toBe('  claude ');
  });
});
