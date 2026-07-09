import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sandbox } from '@vercel/sandbox';
import { printSandboxSummary } from '../../../../src/util/sandbox/print-sandbox-summary';

function fakeSandbox(routes: { port: number; url: string }[]) {
  return {
    name: 'my-sandbox',
    interactivePort: 39375,
    routes: [
      { port: 39375, url: 'https://interactive.example.com' },
      ...routes,
    ],
  } as unknown as Sandbox;
}

function spyOnWrite(stream: NodeJS.WriteStream) {
  return vi.spyOn(stream, 'write').mockReturnValue(true);
}

describe('printSandboxSummary', () => {
  let stdoutWrite: ReturnType<typeof spyOnWrite>;
  let stderrWrite: ReturnType<typeof spyOnWrite>;

  beforeEach(() => {
    stdoutWrite = spyOnWrite(process.stdout);
    stderrWrite = spyOnWrite(process.stderr);
  });

  afterEach(() => {
    stdoutWrite.mockRestore();
    stderrWrite.mockRestore();
  });

  function stdoutOutput() {
    return stdoutWrite.mock.calls.map(call => call[0]).join('');
  }

  function stderrOutput() {
    return stderrWrite.mock.calls.map(call => call[0]).join('');
  }

  it('writes only the sandbox name to stdout', () => {
    printSandboxSummary({
      sandbox: fakeSandbox([]),
      contextName: 'my-team',
      action: 'created',
    });

    expect(stdoutOutput()).toContain('my-sandbox');
    for (const call of stdoutWrite.mock.calls) {
      expect(String(call[0])).toContain('my-sandbox');
    }
  });

  it('writes the decorative summary (team, action) to stderr', () => {
    printSandboxSummary({
      sandbox: fakeSandbox([]),
      contextName: 'my-team',
      action: 'created',
    });

    const stderrText = stderrOutput();
    expect(stderrText).toContain('created');
    expect(stderrText).toContain('my-team');
    expect(stderrText).not.toContain('my-sandbox');
  });

  it('writes each published port route to stderr, excluding the interactive port', () => {
    printSandboxSummary({
      sandbox: fakeSandbox([
        { port: 3000, url: 'https://three-thousand.example.com' },
        { port: 8080, url: 'https://eighty-eighty.example.com' },
      ]),
      contextName: 'my-team',
      action: 'created',
    });

    const stderrText = stderrOutput();
    expect(stderrText).toContain('3000');
    expect(stderrText).toContain('https://three-thousand.example.com');
    expect(stderrText).toContain('8080');
    expect(stderrText).toContain('https://eighty-eighty.example.com');
    expect(stderrText).not.toContain('39375');
    expect(stderrText).not.toContain('interactive.example.com');
  });

  it('supports a custom action string, e.g. for fork', () => {
    printSandboxSummary({
      sandbox: fakeSandbox([]),
      contextName: 'my-team',
      action: 'forked from source-sandbox',
    });

    expect(stderrOutput()).toContain('forked from source-sandbox');
  });

  it('writes nothing but the sandbox name to stdout even with ports', () => {
    printSandboxSummary({
      sandbox: fakeSandbox([{ port: 3000, url: 'https://example.com' }]),
      contextName: 'my-team',
      action: 'created',
    });

    for (const call of stdoutWrite.mock.calls) {
      expect(String(call[0])).toContain('my-sandbox');
    }
    expect(stdoutOutput()).not.toContain('team');
    expect(stdoutOutput()).not.toContain('3000');
  });
});
