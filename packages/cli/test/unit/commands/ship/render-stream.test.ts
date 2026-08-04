import { describe, beforeEach, afterEach, expect, it, vi } from 'vitest';
import { StreamRenderer } from '../../../../src/commands/ship/render-stream';
import output from '../../../../src/output-manager';

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
  });

  const all = () => written.join('');

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
    expect(all()).toBe('no newline yet\n');
  });

  it('emits complete lines as they arrive', () => {
    const renderer = new StreamRenderer();
    renderer.render({ type: 'text-delta', text: 'first\nsecond\nthi' });

    expect(all()).toBe('first\nsecond\n');
  });

  it('separates reasoning from the answer', () => {
    const renderer = new StreamRenderer();
    renderer.render({ type: 'reasoning-delta', text: 'weighing options\n' });
    renderer.render({ type: 'text-delta', text: 'the answer\n' });

    const out = all();
    expect(out).toContain('Thinking');
    expect(out).toContain('weighing options');
    expect(out).toContain('the answer');
    expect(out.indexOf('Thinking')).toBeLessThan(out.indexOf('the answer'));
  });

  it('closes the thinking block on reasoning-end', () => {
    const renderer = new StreamRenderer();
    renderer.render({ type: 'reasoning-delta', text: 'partial reasoning' });
    renderer.render({ type: 'reasoning-end' });

    expect(all()).toContain('partial reasoning');
  });
});
