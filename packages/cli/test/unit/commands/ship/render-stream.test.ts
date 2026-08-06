import { describe, beforeEach, afterEach, expect, it, vi } from 'vitest';
import { StreamRenderer } from '../../../../src/commands/ship/render-stream';
import output from '../../../../src/output-manager';
import stripAnsi from 'strip-ansi';

describe('ship StreamRenderer', () => {
  let written: string[];

  beforeEach(() => {
    written = [];
    vi.spyOn(output, 'print').mockImplementation((str: string) => {
      written.push(str);
    });
    vi.spyOn(output, 'debug').mockImplementation(() => {});
    vi.spyOn(output, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // The reasoning tests advance the clock; leaving it advanced would leak.
    vi.useRealTimers();
  });

  const all = () => written.join('');
  const strip = (value: string) => stripAnsi(value);

  it('joins deltas and emits them once the line completes', () => {
    const renderer = new StreamRenderer();
    renderer.render({ type: 'text-delta', text: 'Hello ' });
    renderer.render({ type: 'text-delta', text: 'world\n' });

    expect(all()).toContain('Hello world');
  });

  it('reports tool calls so long sessions are not silent', () => {
    const renderer = new StreamRenderer();
    renderer.render({ type: 'tool-call', toolName: 'Read' });

    expect(all()).toContain('Read');
  });

  it('summarizes the tool input so the line is useful', () => {
    const renderer = new StreamRenderer();
    renderer.render({
      type: 'tool-call',
      toolName: 'Read',
      input: { file_path: 'vercel.json' },
    });

    expect(all()).toContain('vercel.json');
  });

  it('supports the legacy args field', () => {
    const renderer = new StreamRenderer();
    renderer.render({
      type: 'tool-call',
      toolName: 'bash',
      args: { command: 'vercel whoami' },
    });

    expect(all()).toContain('vercel whoami');
  });

  it('collapses whitespace and truncates a long summary', () => {
    const renderer = new StreamRenderer();
    renderer.render({
      type: 'tool-call',
      toolName: 'bash',
      input: { command: `echo ${'x'.repeat(200)}\n  && ls` },
    });

    const line = all();
    expect(line).toContain('…');
    expect(line).not.toContain('\n  && ls');
    expect(line.length).toBeLessThan(140);
  });

  it('handles a tool call with no summarizable input', () => {
    const renderer = new StreamRenderer();
    renderer.render({ type: 'tool-call', toolName: 'TodoWrite', input: {} });

    expect(all()).toContain('TodoWrite');
  });

  it('reports tool errors', () => {
    const renderer = new StreamRenderer();
    renderer.render({ type: 'tool-error', toolName: 'bash' });

    expect(all()).toContain('bash');
    expect(all()).toContain('failed');
  });

  it('routes stream errors through output.error', () => {
    const renderer = new StreamRenderer();
    renderer.render({ type: 'error', error: new Error('boom') });

    expect(output.error).toHaveBeenCalledWith('boom');
  });

  it('sends unknown part types to debug rather than dropping them', () => {
    const renderer = new StreamRenderer();
    renderer.render({ type: 'finish-step' });

    expect(output.debug).toHaveBeenCalledWith(
      expect.stringContaining('finish-step')
    );
    expect(all()).toBe('');
  });

  it('tracks whether anything has been written', () => {
    const renderer = new StreamRenderer();
    expect(renderer.hasOutput).toBe(false);

    renderer.render({ type: 'text-delta', text: 'hi\n' });
    expect(renderer.hasOutput).toBe(true);
  });

  it('does not count an empty delta as output', () => {
    const renderer = new StreamRenderer();
    renderer.render({ type: 'text-delta', text: '' });

    expect(renderer.hasOutput).toBe(false);
  });

  it('closes a partial line before a tool call', () => {
    const renderer = new StreamRenderer();
    renderer.render({ type: 'text-delta', text: 'partial prose' });
    renderer.render({ type: 'tool-call', toolName: 'Read' });

    expect(all()).toMatch(/partial prose\n/);
  });

  it('holds an unterminated line until flushed', () => {
    const renderer = new StreamRenderer();
    renderer.render({ type: 'text-delta', text: 'no newline yet' });
    expect(all()).toBe('');

    renderer.flush();
    expect(strip(all())).toBe('   agent  no newline yet\n');
  });

  it('emits complete lines as they arrive', () => {
    const renderer = new StreamRenderer();
    renderer.render({ type: 'text-delta', text: 'first\nsecond\nthi' });

    expect(strip(all())).toBe('   agent  first\n          second\n');
  });

  describe('attribution', () => {
    it('labels agent prose with the harness that produced it', () => {
      const renderer = new StreamRenderer();
      renderer.attribute('claude-code');
      renderer.render({ type: 'text-delta', text: 'I found two services.\n' });

      expect(strip(all())).toBe('  claude  I found two services.\n');
    });

    it('labels a tool call with what it did, not the tool that did it', () => {
      const renderer = new StreamRenderer();
      renderer.render({
        type: 'tool-call',
        toolName: 'Bash',
        input: { command: 'vercel build' },
      });

      expect(strip(all())).toBe('     ran  vercel build\n');
    });

    it('uses a verb per kind of action', () => {
      const cases: [string, string][] = [
        ['Read', '    read'],
        ['Write', '   wrote'],
        ['Edit', '  edited'],
        ['Grep', 'searched'],
        ['Task', 'delegat'],
      ];

      for (const [tool, expected] of cases) {
        written = [];
        const renderer = new StreamRenderer();
        renderer.render({ type: 'tool-call', toolName: tool });
        expect(strip(all())).toContain(expected);
      }
    });

    it('labels a line only once per block, holding the text column', () => {
      const renderer = new StreamRenderer();
      renderer.attribute('codex');
      renderer.render({ type: 'text-delta', text: 'one\ntwo\n' });

      expect(strip(all())).toBe('   codex  one\n          two\n');
    });

    it('labels again after a blank line, since that is a new thought', () => {
      const renderer = new StreamRenderer();
      renderer.attribute('codex');
      renderer.render({ type: 'text-delta', text: 'one\n\ntwo\n' });

      expect(strip(all())).toBe('   codex  one\n\n   codex  two\n');
    });
  });

  describe('reasoning', () => {
    it('is collapsed to its duration by default', () => {
      const renderer = new StreamRenderer();
      renderer.attribute('claude-code');
      renderer.render({ type: 'reasoning-delta', text: 'weighing options\n' });
      vi.useFakeTimers();
      vi.setSystemTime(Date.now() + 12_000);
      renderer.render({ type: 'reasoning-end' });

      const out = strip(all());
      expect(out).toContain('thought for 12s');
      expect(out).not.toContain('weighing options');
    });

    it('is not worth a line when it was brief', () => {
      const renderer = new StreamRenderer();
      renderer.render({ type: 'reasoning-delta', text: 'quick\n' });
      renderer.render({ type: 'reasoning-end' });

      expect(strip(all())).toBe('');
    });

    it('is printed in full when verbose', () => {
      const renderer = new StreamRenderer();
      renderer.attribute('claude-code', { verbose: true });
      renderer.render({ type: 'reasoning-delta', text: 'weighing options\n' });
      renderer.render({ type: 'text-delta', text: 'the answer\n' });

      const out = strip(all());
      expect(out).toContain('weighing options');
      expect(out).toContain('the answer');
      expect(out.indexOf('weighing options')).toBeLessThan(
        out.indexOf('the answer')
      );
    });

    it('emits a partial reasoning line on reasoning-end when verbose', () => {
      const renderer = new StreamRenderer();
      renderer.attribute('claude-code', { verbose: true });
      renderer.render({ type: 'reasoning-delta', text: 'partial reasoning' });
      renderer.render({ type: 'reasoning-end' });

      expect(strip(all())).toContain('partial reasoning');
    });
  });
});

describe('ship StreamRenderer durations', () => {
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
    vi.useRealTimers();
  });

  const out = () => stripAnsi(written.join(''));

  /** Start a call, advance the clock, then settle it. */
  function call(
    renderer: StreamRenderer,
    id: string,
    command: string,
    settle?: boolean
  ) {
    renderer.render({
      type: 'tool-call',
      toolCallId: id,
      toolName: 'bash',
      input: { command },
    });
    if (settle) {
      renderer.render({
        type: 'tool-result',
        toolCallId: id,
        toolName: 'bash',
      });
    }
  }

  it('reports a lone slow call under the line it belongs to', () => {
    vi.useFakeTimers({ toFake: ['performance'] });
    const renderer = new StreamRenderer();
    call(renderer, 'a', 'vercel build');
    vi.advanceTimersByTime(4000);
    renderer.render({ type: 'tool-result', toolCallId: 'a', toolName: 'bash' });

    // Nothing was printed in between, so the bare duration is unambiguous.
    expect(out()).toContain('    took  4s\n');
  });

  it('reports one duration for a batch of parallel calls', () => {
    vi.useFakeTimers({ toFake: ['performance'] });
    const renderer = new StreamRenderer();
    call(renderer, 'a', 'vercel curl https://app.example.com/api/todos');
    call(renderer, 'b', 'vercel curl https://app.example.com/api/docs');
    call(renderer, 'c', 'vercel curl https://app.example.com/api/health');
    vi.advanceTimersByTime(3000);
    renderer.render({ type: 'tool-result', toolCallId: 'a', toolName: 'bash' });
    vi.advanceTimersByTime(2000);
    renderer.render({ type: 'tool-result', toolCallId: 'b', toolName: 'bash' });
    vi.advanceTimersByTime(1000);
    renderer.render({ type: 'tool-result', toolCallId: 'c', toolName: 'bash' });

    // One line, once, measuring what was actually waited for.
    expect(out()).toContain('    took  6s for 3 calls\n');
    expect(out().match(/took/g)).toHaveLength(1);
  });

  it('counts a call that joined a batch already running', () => {
    vi.useFakeTimers({ toFake: ['performance'] });
    const renderer = new StreamRenderer();
    call(renderer, 'a', 'vercel build');
    vi.advanceTimersByTime(1000);
    call(renderer, 'b', 'vercel whoami', true);
    vi.advanceTimersByTime(4000);
    renderer.render({ type: 'tool-result', toolCallId: 'a', toolName: 'bash' });

    expect(out()).toContain('took  5s for 2 calls');
  });

  it('starts a new batch after the previous one settles', () => {
    vi.useFakeTimers({ toFake: ['performance'] });
    const renderer = new StreamRenderer();
    call(renderer, 'a', 'vercel build');
    vi.advanceTimersByTime(4000);
    renderer.render({ type: 'tool-result', toolCallId: 'a', toolName: 'bash' });
    call(renderer, 'b', 'vercel deploy');
    vi.advanceTimersByTime(5000);
    renderer.render({ type: 'tool-result', toolCallId: 'b', toolName: 'bash' });

    // Two separate batches, not one nine-second batch of two calls.
    expect(out()).toContain('took  4s\n');
    expect(out()).toContain('took  5s\n');
    expect(out()).not.toContain('calls');
  });

  it('says nothing about a batch that was quick', () => {
    const renderer = new StreamRenderer();
    call(renderer, 'a', 'ls', true);

    expect(out()).not.toContain('took');
  });

  it('still accounts for a batch whose last call failed', () => {
    vi.useFakeTimers({ toFake: ['performance'] });
    const renderer = new StreamRenderer();
    call(renderer, 'a', 'vercel build');
    vi.advanceTimersByTime(4000);
    renderer.render({
      type: 'tool-error',
      toolCallId: 'a',
      toolName: 'bash',
      error: 'boom',
    });

    expect(out()).toContain('failed');
    expect(out()).toContain('took  4s');
  });
});
